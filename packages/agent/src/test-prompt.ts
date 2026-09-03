import { createLlmProvider, Agent, tools, getAgentLoopPrompt } from "./index";

console.log("=== Agent Loop Prompt ===");
console.log(getAgentLoopPrompt());
console.log("\n=== End prompt ===\n");

const provider = createLlmProvider();
const agent = new Agent({ provider, tools });

agent.conversation.subscribe((e) => {
  if (e.type === "text_delta") process.stdout.write(e.text);
  if (e.type === "tool_call_started") console.log(`\n[Tool: ${e.call.name}]`);
  if (e.type === "tool_result") console.log(`\n[Result: ${e.result.slice(0, 100)}]`);
});

console.log("=== Test: Simple greeting (should NOT use tools) ===");
await agent.run("Hi there!");
console.log("\n");
