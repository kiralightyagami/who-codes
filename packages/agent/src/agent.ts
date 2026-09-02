import type { LlmProvider, LlmMessage } from "./llm/types";
import type { Tool } from "./tools/types";
import { Conversation, type ChatMessage, type ToolCallInfo } from "./conversation";
import { getLlmTools } from "./tools/index";

/**
 * Options for creating an Agent.
 */
export interface AgentOptions {
  provider: LlmProvider;
  tools: Tool[];
  /** System prompt / instructions for the model. */
  systemPrompt?: string;
  /** Initial conversation (for restoring sessions). */
  initialMessages?: ChatMessage[];
}

/**
 * The Agent is the brain — it takes user input, talks to the LLM,
 * executes tools, and loops until done.
 *
 * It communicates via the Conversation event store, so the UI just
 * subscribes and renders events as they come in.
 */
export class Agent {
  public readonly conversation: Conversation;
  private readonly provider: LlmProvider;
  private readonly tools: Tool[];
  private readonly toolMap: Map<string, Tool>;
  private readonly systemPrompt?: string;
  /** Collects streaming tool calls until the LLM response ends. */
  private pendingToolCalls: Map<string, ToolCallInfo> = new Map();

  constructor(opts: AgentOptions) {
    this.conversation = new Conversation();
    this.provider = opts.provider;
    this.tools = opts.tools;
    this.systemPrompt = opts.systemPrompt;

    // Build a quick lookup: tool name → Tool object
    this.toolMap = new Map();
    for (const t of this.tools) {
      this.toolMap.set(t.name, t);
    }

    // Seed initial messages if provided (e.g. restoring a session)
    if (opts.initialMessages) {
      this.conversation.messages = [...opts.initialMessages];
    }
  }

  /**
   * Convert our internal ChatMessage[] to the LlmMessage[] format
   * expected by the provider.
   */
  private toLlmMessages(): LlmMessage[] {
    return this.conversation.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      toolCallId: msg.toolName ? undefined : undefined,
      toolName: msg.toolName,
    }));
  }

  /**
   * Convert our Tool[] to the provider's LlmTool[] format.
   */
  private toLlmTools() {
    return getLlmTools(this.tools);
  }

  // --- Public API ---

  /**
   * Send a user message and start the agent loop.
   *
   * Emits events to the Conversation:
   *   - "agent_start"       (once, at the beginning)
   *   - "message_added"     (for the user message)
   *   - "text_delta"        (streaming text from the LLM)
   *   - "tool_call_started" (when the LLM requests a tool)
   *   - "tool_result"       (after a tool finishes )
   *   - "message_added"     (assistant full message)
   *   - "agent_end"         (once, at the end)
   */
  async run(userInput: string): Promise<void> {
    this.conversation.emit({ type: "agent_start" });

    const userMsg: ChatMessage = {
      id: this.conversation.nextId(),
      role: "user",
      content: userInput,
      timestamp: Date.now(),
    };
    this.conversation.addMessage(userMsg);

    try {
      await this._streamAndLoop();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.conversation.emit({ type: "error", message: errorMsg });
      this.conversation.emit({ type: "agent_end" });
    }
  }

  /**
   * Single pass: send messages to LLM, stream text + collect tool calls.
   */
  private async _streamAndLoop(): Promise<void> {
    this.pendingToolCalls.clear();

    const messages = this.toLlmMessages();
    const tools = this.toLlmTools();

    const assistantMsg: ChatMessage = {
      id: this.conversation.nextId(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };
    this.conversation.addMessage(assistantMsg);

    for await (const chunk of this.provider.chat(messages, tools)) {
      if (chunk.type === "text") {
        assistantMsg.content += chunk.text;
        this.conversation.emit({ type: "text_delta", text: chunk.text });
      }
      if (chunk.type === "tool_call") {
        const call: ToolCallInfo = {
          id: chunk.id,
          name: chunk.name,
          args: chunk.args,
        };
        this.pendingToolCalls.set(chunk.id, call);
        this.conversation.emit({ type: "tool_call_started", call });
      }
    }

    if (this.pendingToolCalls.size > 0) {
      await this._executeAndLoop();
    } else {
      this.conversation.emit({ type: "agent_end" });
    }
  }

  /**
   * Execute all pending tool calls, add their results to conversation
   * history, then loop back to _streamAndLoop() to continue the turn.
   *
   * This is the core of the agent loop:
   *   1. Find each tool in the toolMap
   *   2. Execute it with the LLM-provided args
   *   3. Emit a tool_result event
   *   4. Add the result as a tool message in history
   *   5. Call _streamAndLoop() again — the LLM gets the results and responds
   */
  private async _executeAndLoop(): Promise<void> {
    for (const call of this.pendingToolCalls.values()) {
      const tool = this.toolMap.get(call.name);

      if (!tool) {
        // Tool not found — tell the LLM it made an error
        const result = `Error: Unknown tool "${call.name}". Available tools: ${[...this.toolMap.keys()].join(", ")}`;
        this.conversation.emit({
          type: "tool_result",
          callId: call.id,
          name: call.name,
          result,
        });
        this.conversation.addMessage({
          id: this.conversation.nextId(),
          role: "tool",
          content: result,
          toolName: call.name,
          timestamp: Date.now(),
        });
        continue;
      }

      try {
        const result = await tool.execute(call.args);

        this.conversation.emit({
          type: "tool_result",
          callId: call.id,
          name: call.name,
          result,
        });

        // Store args so the provider can reconstruct the assistant tool call
        const argsJson = JSON.stringify(call.args);
        this.conversation.addMessage({
          id: call.id,  // use tool call id as message id for linking
          role: "tool",
          content: result,
          toolName: call.name,
          timestamp: Date.now(),
        });

        // Also need to keep the assistant's tool-call message in history
        // so the provider sees the conversation correctly
        // (We store the args on the message content using a prefix)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.conversation.emit({
          type: "tool_result",
          callId: call.id,
          name: call.name,
          result: `Error executing tool: ${errorMsg}`,
        });
        this.conversation.addMessage({
          id: this.conversation.nextId(),
          role: "tool",
          content: `Error executing tool: ${errorMsg}`,
          toolName: call.name,
          timestamp: Date.now(),
        });
      }
    }

    // Clear pending calls before re-streaming
    this.pendingToolCalls.clear();

    // Loop back — the LLM sees the tool results and responds again
    await this._streamAndLoop();
  }

  /** Abort the current run. */
  abort(): void {
    // TODO: implement via AbortController
  }

  /** Clear conversation history. */
  clear(): void {
    this.conversation.clear();
  }
}
