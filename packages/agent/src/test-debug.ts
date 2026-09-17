import { createLlmProvider } from "./llm/index";
import { Agent } from "./agent";
import { tools } from "./tools";

const provider = createLlmProvider();
console.log("Provider:", provider.name);

async function runTest(label: string, input: string) {
  console.log(`\n>>> ${label}`);
  const agent = new Agent({ provider, tools });
  agent.conversation.subscribe((e) => {
    if (e.type === "text_delta") process.stdout.write(e.text);
    if (e.type === "tool_call_started") console.log(`\n[Tool: ${e.call.name}]`);
    if (e.type === "tool_result") console.log(`\n  → ${e.result.slice(0, 100)}`);
    if (e.type === "error") console.log(`\n[ERROR] ${e.message}`);
    if (e.type === "agent_end") console.log("\n>>> End turn.\n");
  });
  await agent.run(input);
}

await runTest("Test 1: Greeting (no tools)", "Hi!");
await runTest("Test 2: List files", "List the files in src/");
