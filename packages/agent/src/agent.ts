import type { LlmProvider, LlmMessage, LlmResponseChunk } from "./llm/types";
import type { Tool } from "./tools/types";
import { Conversation, type ChatMessage, type ConversationEvent } from "./conversation";
import { getLlmTools } from "./tools/index";

/**
 * Options for creating an Agent.
 */
export interface AgentOptions {
  provider: LlmProvider;
  tools: Tool[];
  /** System prompt / instructions for the model. */
  systemPrompt?: string;
  /** Initial conversation */
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

    // Seed initial messages if provided 
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
      toolCallId: msg.toolName ? undefined : undefined, // set properly in run()
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

  /** Send a user message and start the agent loop. */
  async run(userInput: string): Promise<void> {
 
    console.log("Agent.run() called with:", userInput);
    console.log("Tools available:", this.tools.map((t) => t.name).join(", "));
  }

  /** Abort the current run (if any). */
  abort(): void {
    // TODO: implement abort via AbortController
  }

  /** Clear conversation history. */
  clear(): void {
    this.conversation.clear();
  }
}
