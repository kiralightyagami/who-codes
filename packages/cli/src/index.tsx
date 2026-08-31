import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import dotenv from "dotenv";
import { Header } from "./components/header";
import { Input } from "./components/input";
import { ChatMessages } from "./components/chat";
import { createLlmProvider } from "../../agent/src/llm/factory";
import { Agent, tools } from "../../agent/src";
import type { ChatMessage, ConversationEvent } from "../../agent/src";
import { useState, useEffect, useRef } from "react";


dotenv.config({ path: "../agent/.env" });

const renderer = await createCliRenderer();

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAgentRunning, setIsAgentRunning] = useState(false);

  const agentRef = useRef<Agent | null>(null);

  // Create the agent once
  if (agentRef.current === null) {
    const provider = createLlmProvider();
    agentRef.current = new Agent({
      provider,
      tools,
      systemPrompt: "You are WhoCodes, a minimal coding agent. Use tools when needed. Be concise.",
    });
  }

  const agent = agentRef.current!;

  // Subscribe to conversation events
  useEffect(() => {
    const unsubscribe = agent.conversation.subscribe((event: ConversationEvent) => {
      if (event.type === "message_added") {
        setMessages((prev) => [...prev, event.message]);
      }
      if (event.type === "agent_start") {
        setIsAgentRunning(true);
      }
      if (event.type === "agent_end") {
        setIsAgentRunning(false);
      }
    });

    return () => unsubscribe();
  }, [agent]);

  const handleSend = (text: string) => {
    if (isAgentRunning) return; // Don't allow input while agent is running

    agent.run(text).catch((err) => {
      console.error("Agent error:", err);
      setIsAgentRunning(false);
    });
  };

  return (
    <box
      alignItems="center"
      justifyContent="center"
      backgroundColor="#0D0D09"
      flexGrow={1}
      gap={2}
    >
      <Header />
      <box width={"100%"} maxWidth={78} paddingX={2} flexGrow={1} flexDirection="column">
        {/* Chat history (scrollable) */}
        <ChatMessages messages={messages} height={20} />
        {/* Input box at bottom */}
        <Input onSubmit={handleSend} disabled={isAgentRunning} />
      </box>
    </box>
  );
}

createRoot(renderer).render(<App />);
