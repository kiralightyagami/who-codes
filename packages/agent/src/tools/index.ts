import { type Tool } from "./types";
import { readTool } from "./read";
import { writeTool } from "./write";
import { bashTool } from "./bash";
import { editTool } from "./edit";

/**
 * All built-in tools available to the agent.
 * This array is passed to the LLM provider during chat so the model
 * knows what actions it can take.
 */
export const tools: Tool[] = [readTool, writeTool, bashTool, editTool];

/**
 * Convert our internal Tool[] into the LlmTool[] format expected by
 * any LLM provider (Gemini, OpenAI, etc.).
 */
export function getLlmTools(tools: Tool[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

// Re-export everything
export { readTool, writeTool, bashTool, editTool };
export type { Tool } from "./types";
