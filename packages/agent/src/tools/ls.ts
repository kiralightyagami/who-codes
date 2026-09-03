import { type Tool, Type } from "./types";

export const lsTool: Tool = {
  name: "ls",
  description: "List directory contents.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: Type.STRING,
        description: "Directory to list. Default: current directory.",
      },
    },
    required: [],
  },
  execute: async (args) => {
    const { path = "." } = args as { path?: string };

    try {
      const entries = await Bun.file(path).stat();
      // Not a directory — list doesn't make sense
      if (!entries?.isDirectory?.()) {
        return `Error: ${path} is not a directory`;
      }
    } catch {
      // Fall through to shell command
    }

    try {
      const proc = Bun.spawn(["ls", "-la", path], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      if (exitCode !== 0) {
        return `Error: ${stderr || stdout}`;
      }
      return stdout || "(empty directory)";
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
