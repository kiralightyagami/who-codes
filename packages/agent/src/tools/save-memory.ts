import { type Tool, Type } from "../tools/types";
import { memoryManager } from "../manager/memory.manager";
import { projectRoot } from "../utils/tool.utils";

export const saveMemoryTool: Tool = {
  name: "SAVE_MEMORY",
  description:
    "Save a useful fact or user preference about this project/workspace so it can be recalled in future conversations.",
  parameters: {
    type: "object",
    properties: {
      fact: {
        type: Type.STRING,
        description: "A fact about the project or workspace (e.g. 'Tailwind is not installed', 'Uses Bun runtime').",
      },
      preference: {
        type: Type.STRING,
        description: "Optional: a preference key (e.g. 'colorScheme', 'formatters').",
      },
      preferenceValue: {
        type: Type.STRING,
        description: "Optional: the value for the preference key.",
      },
    },
    required: ["fact"],
  },
  execute: async (args) => {
    const { fact, preference, preferenceValue } = args as {
      fact: string;
      preference?: string;
      preferenceValue?: string;
    };

    memoryManager.saveFact(projectRoot, fact);

    if (preference && preferenceValue !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(preferenceValue);
      } catch {
        parsed = preferenceValue;
      }
      memoryManager.savePreference(projectRoot, preference, parsed);
    }

    return `Saved to memory: "${fact}"`;
  },
};
