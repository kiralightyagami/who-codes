import type {
  LlmMessage,
  LlmProvider,
  LlmResponseChunk,
  LlmTool,
  ProviderOptions,
} from "./types";

/**
 * OpenAI-compatible provider implemented with raw fetch so we don't need
 * to add the `openai` npm package. Works with OpenAI, and any OpenAI-compatible
 * endpoint (e.g. Ollama, Together, etc.).
 */

const OPENAI_BASE = "https://api.openai.com/v1";

interface OpenAIChatMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
  };
}

export class OpenAIProvider implements LlmProvider {
  readonly name = "openai";
  private apiKey: string;
  private model: string;
  private systemPrompt?: string;
  private baseUrl: string;

  constructor(opts: ProviderOptions & { baseUrl?: string } = {}) {
    const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set. Set it in your environment or pass opts.apiKey.",
      );
    }
    this.apiKey = apiKey;
    this.model = opts.model ?? process.env.OPENAI_MODEL ?? "gpt-4o";
    this.systemPrompt = opts.systemPrompt ?? process.env.SYSTEM_PROMPT;
    this.baseUrl = opts.baseUrl ?? process.env.OPENAI_BASE_URL ?? OPENAI_BASE;
  }

  /** Convert internal messages to OpenAI format. */
  private toOaiMessages(messages: LlmMessage[]): OpenAIChatMessage[] {
    const result: OpenAIChatMessage[] = [];

    if (this.systemPrompt) {
      result.push({ role: "system", content: this.systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === "tool") {
        result.push({
          role: "tool",
          content: msg.content,
          tool_call_id: msg.toolCallId!,
        });
      } else if (msg.role === "assistant" && msg.toolName && msg.toolCallId) {
        // Assistant message carrying a tool call
        result.push({
          role: "assistant",
          content: msg.content || null,
          tool_calls: [
            {
              id: msg.toolCallId,
              type: "function",
              function: {
                name: msg.toolName,
                arguments: JSON.stringify(msg.content ? JSON.parse(msg.content) : {}),
              },
            },
          ],
        });
      } else {
        result.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }
    return result;
  }

  /** Convert internal tools to OpenAI tool declarations. */
  private toOaiTools(tools: LlmTool[]): OpenAITool[] {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        strict: false,
      },
    }));
  }

  async *chat(
    messages: LlmMessage[],
    tools: LlmTool[],
  ): AsyncGenerator<LlmResponseChunk> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: this.toOaiMessages(messages),
      stream: true,
      stream_options: { include_usage: false },
    };

    if (tools.length > 0) {
      body.tools = this.toOaiTools(tools);
      body.tool_choice = "auto";
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${text}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("Response body is not readable");
    }

    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    const done = Symbol("done");

    try {
      while (true) {
        const { value, done: isDone } = await reader.read();
        if (isDone) {
          // Process any remaining buffer
          if (buffer.trim()) {
            const chunk = this.parseSseLine(buffer);
            if (chunk) yield chunk;
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines (each starts with "data: ")
        while (buffer.includes("\n")) {
          const newlineIdx = buffer.indexOf("\n");
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);

          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            const jsonStr = line.slice(6);
            const chunk = this.parseSseLine(jsonStr);
            if (chunk) yield chunk;
          }
        }
      }
    } finally {
      reader.releaseLock?.();
    }
  }

  /** Parse a single JSON SSE data payload into our chunk type. */
  private parseSseLine(jsonStr: string): LlmResponseChunk | null {
    let data: any;
    try {
      data = JSON.parse(jsonStr);
    } catch {
      return null;
    }

    // Text delta from a regular content part
    if (data.choices?.[0]?.delta?.content) {
      return { type: "text", text: data.choices[0].delta.content };
    }

    // Tool call delta
    const delta = data.choices?.[0]?.delta;
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (tc.function?.name) {
          // First chunk of a tool call — has the name and an id
          return {
            type: "tool_call",
            id: tc.id ?? `tc-${Date.now()}`,
            name: tc.function.name,
            args: tc.function.arguments
              ? JSON.parse(tc.function.arguments)
              : {},
          };
        }
        if (tc.function?.arguments) {
          // Continuation — we yield as a text-like chunk for args
          // (The agent loop will assemble these.)
          return {
            type: "tool_call",
            id: tc.id ?? `tc-${Date.now()}`,
            name: "",
            args: JSON.parse(tc.function.arguments),
          };
        }
      }
    }

    return null;
  }
}

export { OPENAI_BASE };
