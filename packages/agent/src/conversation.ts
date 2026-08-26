/**
 * Conversation event types — these are the events the Agent loop emits,
 * and the UI (or any subscriber) listens to.
 *
 * Think of this as the "pub/sub" layer between the agent brain and the UI.
 */

export type MessageRole = "user" | "assistant" | "tool";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  /** Displayed text content. For tool calls, encoded as "__tool_call__:" + JSON. */
  content: string;
  /** For tool messages — which tool this came from. */
  toolName?: string;
  /** Links assistant tool calls to their results. */
  toolCallId?: string;
  /** Timestamp for ordering/display. */
  timestamp: number;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * All event types the Conversation emits.
 * The UI subscribes to these and updates its render accordingly.
 */
export type ConversationEvent =
  | { type: "message_added"; message: ChatMessage }
  | { type: "text_delta"; text: string }
  | { type: "tool_call_started"; call: ToolCallInfo }
  | { type: "tool_result"; callId: string; name: string; result: string }
  | { type: "agent_start" }
  | { type: "agent_end" }
  | { type: "error"; message: string };

/**
 * The Conversation class is a simple event emitter + message list.
 */
export class Conversation {
  public messages: ChatMessage[] = [];
  private listeners: Set<(event: ConversationEvent) => void> = new Set();

  subscribe(fn: (event: ConversationEvent) => void): () => void {
    this.listeners.add(fn);
    // Emit existing messages so the UI can render history
    for (const msg of this.messages) {
      fn({ type: "message_added", message: msg });
    }
    return () => this.listeners.delete(fn);
  }

  emit(event: ConversationEvent): void {
    this.listeners.forEach((fn) => fn(event));
  }

  /** Add a message to the history (internal helper). */
  addMessage(message: ChatMessage): void {
    this.messages.push(message);
    this.emit({ type: "message_added", message });
  }

  clear(): void {
    this.messages = [];
  }

  private _nextId = 0;
  nextId(): string {
    return `msg_${++this._nextId}`;
  }
}
