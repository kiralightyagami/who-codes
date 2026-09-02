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
import path from "path";
import { fileURLToPath } from "url";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, "../../agent/.env");
dotenv.config({ path: envPath });

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

  useEffect(() => {
    const unsubscribe = agent.conversation.subscribe((event: ConversationEvent) => {
      switch (event.type) {
        case "message_added":
          setMessages((prev) => [...prev, event.message]);
          break;

        case "text_delta":
          // Append streaming text to the last assistant message
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            if (!last || last.role !== "assistant") return prev;
            const updated: ChatMessage = {
              ...last,
              content: last.content + event.text,
            };
            return [...prev.slice(0, -1), updated];
          });
          break;

        case "tool_call_started":
          // Add a tool message to show the tool is being called
          setMessages((prev) => [
            ...prev,
            {
              id: event.call.id,
              role: "tool",
              content: "",
              toolName: event.call.name,
              timestamp: Date.now(),
            },
          ]);
          break;

        case "tool_result":
          // Update the tool message with its result
          setMessages((prev) =>
            prev.map((m) =>
              m.id === event.callId
                ? { ...m, content: event.result }
                : m,
            ),
          );
          break;

        case "agent_start":
          setIsAgentRunning(true);
          break;

        case "agent_end":
          setIsAgentRunning(false);
          break;

        case "error":
          setMessages((prev) => [
            ...prev,
            {
              id: `error_${Date.now()}`,
              role: "assistant",
              content: `⚠ Error: ${event.message}`,
              timestamp: Date.now(),
            },
          ]);
          setIsAgentRunning(false);
          break;
      }
    });

    return () => unsubscribe();
  }, [agent]);

  const handleSend = (text: string) => {
    if (isAgentRunning) return;

    agent.run(text).catch((err: unknown) => {
      // Catch errors so the UI doesn't crash
      const errorMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `error_${Date.now()}`,
          role: "assistant",
          content: `⚠ Error: ${errorMsg}`,
          timestamp: Date.now(),
        },
      ]);
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
      <box
        width={"100%"}
        maxWidth={78}
        paddingX={2}
        flexGrow={1}
        flexDirection="column"
      >
        {/* Chat history (scrollable, fills remaining space) */}
        <ChatMessages messages={messages} />
        {/* Input box at bottom (fixed height) */}
        <box flexShrink={0}>
          <Input onSubmit={handleSend} disabled={isAgentRunning} />
        </box>
      </box>
    </box>
  );
}

createRoot(renderer).render(<App />);
