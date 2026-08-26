import { createLlmProvider } from "./llm/index";
import { Agent } from "./agent";
import { tools } from "./tools";

const provider = createLlmProvider();
const agent = new Agent({
  provider,
  tools,
  systemPrompt: "You are WhoCodes, a minimal coding agent. Use tools when needed. Be concise.",
});

// Subscribe and log all events
agent.conversation.subscribe((event) => {
  switch (event.type) {
    case "agent_start":
      console.log("\n=== Agent started ===\n");
      break;
    case "message_added":
      break; // don't spam — messages are tracked
    case "text_delta":
      process.stdout.write(event.text);
      break;
    case "tool_call_started":
      console.log(`\n[Tool call: ${event.call.name}]`);
      console.log(`  Args: ${JSON.stringify(event.call.args)}`);
      break;
    case "tool_result":
      console.log(`\n[Tool result (${event.name}): ${event.result.slice(0, 120)}]`);
      break;
    case "agent_end":
      console.log("\n\n=== Agent finished ===\n");
      break;
  }
});

// Test: ask the LLM to use a tool
agent.run("List the files in the agent/src directory.").catch(console.error);
