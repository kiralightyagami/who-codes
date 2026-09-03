import { type Tool, Type } from "./types";

export const grepTool: Tool = {
  name: "grep",
  description: "Search for a pattern in files. Returns matching lines with file paths.",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: Type.STRING,
        description: "The regex pattern to search for.",
      },
      path: {
        type: Type.STRING,
        description: "Directory or file to search in. Default: current directory.",
      },
    },
    required: ["pattern"],
  },
  execute: async (args) => {
    const { pattern, path = "." } = args as { pattern: string; path?: string };

    try {
      const proc = Bun.spawn(
        ["grep", "-rn", "--include=*.{ts,tsx,js,jsx,py,go,rs,json,md,txt}", pattern, path],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      if (exitCode === 1) {
        return "No matches found";
      }
      if (exitCode !== 0) {
        return `Error: ${stderr || stdout || "search failed"}`;
      }
      return stdout || "No matches found";
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
