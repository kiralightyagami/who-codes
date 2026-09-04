import { GoogleGenAI, Type, FunctionResponse } from "@google/genai";
import dotenv from "dotenv";
import type {
  LlmMessage,
  LlmProvider,
  LlmResponseChunk,
  LlmTool,
  ProviderOptions,
} from "./types";

dotenv.config();


type GeminiContent = {
  role: "user" | "model";
  parts: Array<{
    text?: string;
    functionCall?: { name: string; args: Record<string, unknown>; id?: string };
    functionResponse?: FunctionResponse;
  }>;
};

/** Maps our provider-agnostic tool to a Gemini FunctionDeclaration. */
function toGeminiTool(tool: LlmTool) {
  return {
    name: tool.name,
    description: tool.description,
    // Gemini's `parameters` field expects a Schema object.
    // Our tools already use JSON Schema, which is compatible.
    parameters: tool.parameters,
  };
}

/**
 * Build the Gemini Content[] array from our internal message format.
 *
 * Our format has:
 *   - assistant messages with optional toolCalls (text + tool calls together)
 *   - tool result messages (role "tool" with toolCallId linking to the call)
 *
 * Gemini expects:
 *   - assistant → Content with role "model", parts containing text + functionCall
 *   - tool result → Content with role "user", parts containing functionResponse
 */
function toGeminiContents(messages: LlmMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    if (msg.role === "tool" && msg.toolCallId) {
      // Tool result — present it to the model as a user message
      // with a functionResponse part.
      const funcResp = new FunctionResponse();
      funcResp.id = msg.toolCallId;
      funcResp.name = msg.toolName!;
      funcResp.response = { output: msg.content };

      contents.push({
        role: "user",
        parts: [{ functionResponse: funcResp }],
      });
    } else if (
      msg.role === "assistant" &&
      msg.toolCalls &&
      msg.toolCalls.length > 0
    ) {
      // Assistant message with tool calls — text + functionCall parts together
      const parts: GeminiContent["parts"] = [];

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      for (const tc of msg.toolCalls) {
        parts.push({
          functionCall: {
            id: tc.id,
            name: tc.name,
            args: tc.args,
          },
        });
      }

      contents.push({
        role: "model",
        parts,
      });
    } else {
      // Regular user/assistant text message
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }

  return contents;
}

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  private ai: GoogleGenAI;
  private model: string;
  private systemPrompt?: string;

  constructor(opts: ProviderOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set. Set it in your environment or pass opts.apiKey.",
      );
    }
    this.ai = new GoogleGenAI({ apiKey });
    this.model = opts.model ?? process.env.GEMINI_MODEL ?? "gemini-3.7-flash";
    this.systemPrompt = opts.systemPrompt ?? process.env.SYSTEM_PROMPT;
  }

  async *chat(
    messages: LlmMessage[],
    tools: LlmTool[],
  ): AsyncGenerator<LlmResponseChunk> {
    const config: Record<string, unknown> = {};

    if (this.systemPrompt) {
      config.systemInstruction = this.systemPrompt;
    }

    if (tools.length > 0) {
      config.tools = [{ functionDeclarations: tools.map(toGeminiTool) }];
    }

    const geminiContents = toGeminiContents(messages);

    const stream = await this.ai.models.generateContentStream({
      model: this.model,
      contents: geminiContents,
      config,
    });

    // Track which function calls we've already yielded so we don't
    // double-emit when args are streamed in partial chunks.
    const seenCallIds = new Set<string>();

    for await (const chunk of stream) {
      // Text deltas
      if (chunk.text) {
        yield { type: "text", text: chunk.text };
      }

      // Function calls
      const fcs = chunk.functionCalls;
      if (fcs && fcs.length > 0) {
        for (const fc of fcs) {
          const id = fc.id ?? `${fc.name}-${Date.now()}`;
          if (seenCallIds.has(id)) continue;

          const args: Record<string, unknown> = {};
          if (fc.args) {
            Object.assign(args, fc.args);
          }

          seenCallIds.add(id);
          yield { type: "tool_call", id, name: fc.name!, args };
        }
      }
    }
  }
}

// Re-export Type for tool schema definitions
export { Type };
