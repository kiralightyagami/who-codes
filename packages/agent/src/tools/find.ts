import { type Tool, Type } from "./types";

export const findTool: Tool = {
  name: "find",
  description: "Find files matching a pattern. Returns matching file paths.",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: Type.STRING,
        description: "Glob pattern to match (e.g. '*.ts', 'src/**/*.js').",
      },
      path: {
        type: Type.STRING,
        description: "Directory to search in. Default: current directory.",
      },
    },
    required: ["pattern"],
  },
  execute: async (args) => {
    const { pattern, path: dir = "." } = args as {
      pattern: string;
      path?: string;
    };

    try {
      // Use find with -name for glob matching
      const proc = Bun.spawn(
        ["find", dir, "-name", pattern, "-not", "-path", "*/node_modules/*"],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();

      if (exitCode !== 0) {
        return "(no matches)";
      }
      return stdout || "(no matches)";
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
