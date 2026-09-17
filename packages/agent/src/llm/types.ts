/**
 * Provider-agnostic types shared across all LLM providers.
 * The agent loop and tools only depend on these — never on a specific SDK.
 */

/** A single message in the conversation history. */
export interface LlmMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  /** For assistant messages — the tool calls this message contains. */
  toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown>; thoughtSignature?: string }>;
  /** For tool results — identifies which call this matches. */
  toolCallId?: string;
  /** The name of the tool (for tool result messages). */
  toolName?: string;
  /** Provider-specific signature echoed back (e.g. Gemini thought_signature). */
  thoughtSignature?: string;
}

/**
 * A tool the LLM can call.
 * `parameters` is a JSON Schema object (type, properties, required, etc.)
 */
export interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * What the streaming chat method yields.
 */
export type LlmResponseChunk =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown>; thoughtSignature?: string };

/**
 * The minimal interface every provider must implement.
 */
export interface LlmProvider {
  /** Human-readable name for debugging / logging. */
  readonly name: string;

  /**
   * Send the full message history + tool list to the LLM and stream back
   * text deltas and tool calls.
   *
   * @param toolChoice - "none" to suppress all tool calls (for greetings),
   *                     "auto" (default) to let the model decide.
   */
  chat(
    messages: LlmMessage[],
    tools: LlmTool[],
    toolChoice?: "auto" | "none",
  ): AsyncGenerator<LlmResponseChunk>;
}

/** Options for creating a provider via the factory. */
export interface ProviderOptions {
  /** API key. Defaults to reading from the environment. */
  apiKey?: string;
  /** Model name, e.g. "gemini-2.0-flash" or "gpt-4o". */
  model?: string;
  /** System instruction / system prompt. */
  systemPrompt?: string;
}
