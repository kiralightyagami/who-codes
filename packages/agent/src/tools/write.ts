import { type Tool, Type } from "./types";

export const writeTool: Tool = {
  name: "write",
  description: "Write content to a file, creating it or overwriting it if it exists.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: Type.STRING,
        description: "The file path to write to.",
      },
      content: {
        type: Type.STRING,
        description: "The text content to write to the file.",
      },
    },
    required: ["path", "content"],
  },
  execute: async (args) => {
    const { path, content } = args as { path: string; content: string };

    await Bun.write(path, content);

    return `Wrote ${content.length} bytes to ${path}`;
  },
};
