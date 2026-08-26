import type {
  LlmMessage,
  LlmProvider,
  LlmResponseChunk,
  LlmTool,
  ProviderOptions,
} from "./types";

/**
 * OpenAI-compatible provider implemented with raw fetch so we don't need
 * to add the `openai` npm package. Works with OpenAI, OpenRouter, and
 * any OpenAI-compatible endpoint.
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
        const argsStr = msg.content && msg.content.startsWith("__tool_call__:")
          ? msg.content.slice("__tool_call__:".length)
          : msg.content ?? "{}";
        result.push({
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: msg.toolCallId,
              type: "function",
              function: { name: msg.toolName, arguments: argsStr },
            },
          ],
        });
      } else {
        result.push({
          role: msg.role === "assistant" ? "assistant" : msg.role,
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
      max_tokens: 2048,
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

    // Accumulate tool calls across streaming chunks, keyed by index.
    const toolCallAccum: Map<number, { id: string; name: string; args: string }> =
      new Map();

    try {
      while (true) {
        const { value, done: isDone } = await reader.read();
        if (isDone) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        while (buffer.includes("\n")) {
          const nlIdx = buffer.indexOf("\n");
          const line = buffer.slice(0, nlIdx).trim();
          buffer = buffer.slice(nlIdx + 1);

          if (!line.startsWith("data:") || line === "data: [DONE]") continue;

          const jsonStr = line.slice(6).trim();
          let data: any;
          try {
            data = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          // --- Text delta (yield immediately) ---
          const textContent = data.choices?.[0]?.delta?.content;
          if (textContent) {
            yield { type: "text", text: textContent };
          }

          // --- Tool call deltas (accumulate) ---
          const delta = data.choices?.[0]?.delta;
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              let acc = toolCallAccum.get(idx);
              if (!acc) {
                acc = {
                  id: tc.id ?? `tc-${Date.now()}-${idx}`,
                  name: "",
                  args: "",
                };
                toolCallAccum.set(idx, acc);
              }
              if (tc.id) acc.id = tc.id;
              if (tc.function?.name) acc.name = tc.function.name;
              if (tc.function?.arguments) acc.args += tc.function.arguments;
            }
          }

          // --- Finish reason — flush accumulated tool calls ---
          const finishReason = data.choices?.[0]?.finish_reason;
          if (finishReason === "tool_calls") {
            for (const [, acc] of toolCallAccum) {
              let args: Record<string, unknown> = {};
              if (acc.args) {
                try {
                  args = JSON.parse(acc.args);
                } catch {
                  args = { _raw: acc.args };
                }
              }
              yield {
                type: "tool_call",
                id: acc.id,
                name: acc.name,
                args,
              };
            }
            toolCallAccum.clear();
          }
        }
      }
    } finally {
      reader.releaseLock?.();
    }
  }
}

export { OPENAI_BASE };
