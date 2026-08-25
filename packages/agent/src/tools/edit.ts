import { type Tool, Type } from "./types";

export const editTool: Tool = {
  name: "edit",
  description:
    "Find and replace a specific string in a file. The old string must match exactly, including whitespace.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: Type.STRING,
        description: "The file path to edit.",
      },
      old: {
        type: Type.STRING,
        description: "The exact text to find and replace.",
      },
      new: {
        type: Type.STRING,
        description: "The replacement text.",
      },
    },
    required: ["path", "old", "new"],
  },
  execute: async (args) => {
    const { path, old: oldText, new: newText } = args as {
      path: string;
      old: string;
      new: string;
    };

    const file = Bun.file(path);
    if (!(await file.exists())) {
      return `Error: File not found: ${path}`;
    }

    const content = await file.text();

    if (!content.includes(oldText)) {
      const preview = oldText.length > 50 ? oldText.slice(0, 50) + "..." : oldText;
      return `Error: Could not find "${preview}" in ${path}`;
    }


    const occurrences = content.split(oldText).length - 1;
    if (occurrences > 1) {
      return `Error: Found ${occurrences} occurrences of the old text in ${path}. Please make the match more specific.`;
    }

    const updated = content.replace(oldText, newText);
    await Bun.write(path, updated);

    const previewLen = 30;
    const oldPreview = oldText.slice(0, previewLen) + (oldText.length > previewLen ? "..." : "");
    const newPreview = newText.slice(0, previewLen) + (newText.length > previewLen ? "..." : "");

    return `Edited ${path}: replaced "${oldPreview}" with "${newPreview}".`;
  },
};
