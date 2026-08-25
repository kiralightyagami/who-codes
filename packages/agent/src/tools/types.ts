import { Type } from "@google/genai";

/**
 * A tool the LLM can call.
 *
 * - `name` / `description` — shown to the LLM so it knows what the tool does
 * - `parameters` — a JSON Schema object describing the args
 * - `execute` — the actual function that runs when the LLM calls this tool
 */
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

/**
 * Convert an internal Tool into the format our LlmTool type expects,
 * so it can be passed to any LLM provider.
 */
export function toLlmTool(tool: Tool): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

export { Type };
