import { type Tool, Type } from "./types";

export const bashTool: Tool = {
  name: "bash",
  description: "Execute a shell command and return its output.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: Type.STRING,
        description: "The shell command to run (via bash -c).",
      },
      timeout: {
        type: Type.INTEGER,
        description: "Timeout in seconds. Default: 30.",
      },
    },
    required: ["command"],
  },
  execute: async (args) => {
    const { command, timeout = 30 } = args as {
      command: string;
      timeout?: number;
    };

    const proc = Bun.spawn(["bash", "-c", command], {
      stdout: "pipe",
      stderr: "pipe",
    });


    const timer = setTimeout(() => {
      proc.kill();
    }, timeout * 1000);

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    clearTimeout(timer);

    const output = stdout + (stderr ? `\n${stderr}` : "");
    if (proc.exitCode !== 0) {
      return `Error (exit ${proc.exitCode}): ${output || "command failed"}`;
    }

    return output || "(no output)";
  },
};
