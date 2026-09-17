import type { LlmProvider, LlmMessage } from "./llm/types";
import type { Tool } from "./tools/types";
import { Conversation, type ChatMessage, type ToolCallInfo } from "./conversation";
import { getLlmTools } from "./tools/index";
import { getAgentLoopPrompt } from "./prompts/agent-loop";

/**
 * Check if a user input is a simple greeting that shouldn't trigger tool calls.
 * Examples: "hi", "hello", "hey", "how are you", "good morning"
 */
const GREETING_RE = /^(hi|hello|hey|howdy|good ?(morning|afternoon|evening|day)|how are you|g?day)\b/i;

function isSimpleGreeting(text: string): boolean {
  const trimmed = text.trim();
  // Short messages that are just greetings
  return trimmed.length <= 30 && GREETING_RE.test(trimmed);
}

/**
 * Options for creating an Agent.
 */
export interface AgentOptions {
  provider: LlmProvider;
  tools: Tool[];
  /** System prompt / instructions for the model. Defaults to getAgentLoopPrompt(). */
  systemPrompt?: string;
  /** Initial conversation (for restoring sessions). */
  initialMessages?: ChatMessage[];
  /** Max messages to send to the LLM (truncated from the end). Default: 20. */
  maxHistoryMessages?: number;
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
  private readonly systemPrompt: string;
  private readonly maxHistoryMessages: number;
  /** Collects streaming tool calls until the LLM response ends. */
  private pendingToolCalls: Map<string, ToolCallInfo> = new Map();
  /** When true, suppresses tool calls for this turn (e.g. simple greetings). */
  private suppressToolsThisTurn: boolean = false;

  constructor(opts: AgentOptions) {
    this.conversation = new Conversation();
    this.provider = opts.provider;
    this.tools = opts.tools;
    this.systemPrompt = opts.systemPrompt ?? getAgentLoopPrompt();
    this.maxHistoryMessages = opts.maxHistoryMessages ?? 20;

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
   * expected by the provider. Truncates old messages beyond
   * maxHistoryMessages to avoid hitting token limits.
   *
   * We pass content and toolCalls through as-is — the provider
   * handles the conversion to its native format.
   */
  private toLlmMessages(): LlmMessage[] {
    const msgs = this.conversation.messages;
    const toSend =
      msgs.length > this.maxHistoryMessages
        ? msgs.slice(msgs.length - this.maxHistoryMessages)
        : msgs;

    return toSend.map((msg) => ({
      role: msg.role,
      content: msg.content,
      toolCalls: msg.toolCalls,
      toolCallId: msg.toolCallId,
      toolName: msg.toolName,
      thoughtSignature: msg.thoughtSignature,
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
   *   - "agent_start"
   *   - "message_added" (user message)
   *   - "text_delta" (streaming text)
   *   - "tool_call_started"
   *   - "tool_result"
   *   - "message_added" (assistant response)
   *   - "error" (on failure)
   *   - "agent_end"
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

    // Detect simple greetings to suppress unnecessary tool calls
    this.suppressToolsThisTurn = isSimpleGreeting(userInput);

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
    const llmTools = this.toLlmTools();

    // Create a placeholder assistant message for this turn's response.
    // Tool calls will be stored on this same message (not separate messages)
    // to match OpenAI/Gemini format where a single assistant message
    // can contain both text and tool_calls.
    const assistantMsg: ChatMessage = {
      id: this.conversation.nextId(),
      role: "assistant",
      content: "",
      toolCalls: [],
      timestamp: Date.now(),
    };
    this.conversation.addMessage(assistantMsg);

    const toolChoice = this.suppressToolsThisTurn ? "none" as const : "auto" as const;
    this.suppressToolsThisTurn = false; // reset for next turn

    for await (const chunk of this.provider.chat(messages, llmTools, toolChoice)) {
      if (chunk.type === "text") {
        assistantMsg.content += chunk.text;
        this.conversation.emit({ type: "text_delta", text: chunk.text });
      }
      if (chunk.type === "tool_call") {
        const call: ToolCallInfo = {
          id: chunk.id,
          name: chunk.name,
          args: chunk.args,
          thoughtSignature: chunk.thoughtSignature,
        };
        this.pendingToolCalls.set(chunk.id, call);

        // Store the tool call on the assistant message (same message as the text)
        if (!assistantMsg.toolCalls) {
          assistantMsg.toolCalls = [];
        }
        assistantMsg.toolCalls.push({
          id: call.id,
          name: call.name,
          args: call.args,
          thoughtSignature: call.thoughtSignature,
        });

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
   */
  private async _executeAndLoop(): Promise<void> {
    for (const call of this.pendingToolCalls.values()) {
      const tool = this.toolMap.get(call.name);

      if (!tool) {
        const result = `Error: Unknown tool "${call.name}". Available: ${[...this.toolMap.keys()].join(", ")}`;
        this.conversation.emit({ type: "tool_result", callId: call.id, name: call.name, result });
        this.conversation.addMessage({
          id: this.conversation.nextId(),
          role: "tool",
          content: result,
          toolName: call.name,
          toolCallId: call.id,
          thoughtSignature: call.thoughtSignature,
          timestamp: Date.now(),
        });
        continue;
      }

      try {
        const result = await tool.execute(call.args);
        this.conversation.emit({ type: "tool_result", callId: call.id, name: call.name, result });
        this.conversation.addMessage({
          id: this.conversation.nextId(),
          role: "tool",
          content: result,
          toolName: call.name,
          toolCallId: call.id,
          thoughtSignature: call.thoughtSignature,
          timestamp: Date.now(),
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const result = `Error: ${errorMsg}`;
        this.conversation.emit({ type: "tool_result", callId: call.id, name: call.name, result });
        this.conversation.addMessage({
          id: this.conversation.nextId(),
          role: "tool",
          content: result,
          toolName: call.name,
          toolCallId: call.id,
          thoughtSignature: call.thoughtSignature,
          timestamp: Date.now(),
        });
      }
    }

    this.pendingToolCalls.clear();
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
