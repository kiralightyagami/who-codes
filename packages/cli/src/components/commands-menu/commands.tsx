import type { Command } from "./types";

export const COMMANDS: Command[] = [
  {
    name: "new",
    description: "Start a new conversation",
    value: "/new",
  },
  {
    name: "quit",
    description: "Quit",
    value: "/quit",
    action: (ctx) => {
      ctx.exit();
    },
  },
];
