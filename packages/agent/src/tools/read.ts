import { type Tool, Type } from "./types";

export const readTool: Tool = {
  name: "read",
  description: "Read the contents of a file at a given path.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: Type.STRING,
        description: "The file path to read.",
      },
    },
    required: ["path"],
  },
  execute: async (args) => {
    const { path } = args as { path: string };

    const file = Bun.file(path);
    if (!(await file.exists())) {
      return `Error: File not found: ${path}`;
    }

    const content = await file.text();
    return content;
  },
};
