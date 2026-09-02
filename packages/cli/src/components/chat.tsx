import { useEffect, useRef } from "react";
import { ScrollBoxRenderable, TextAttributes, type ColorInput } from "@opentui/core";

/**
 * A single chat message to render in the scrollable history.
 */
interface ChatItem {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

/**
 * ChatMessages — a scrollable box that displays the conversation history.
 *
 * Props:
 * - `messages` — the array of messages to render
 * - `isTyping` — when true, shows a "WhoCodes is thinking..." indicator
 *
 * Auto-scrolls to the bottom when messages change.
 * Uses flexGrow={1} to fill available vertical space.
 */
export const ChatMessages = ({
  messages,
  isTyping = false,
}: {
  messages: ChatItem[];
  isTyping?: boolean;
}) => {
  const scrollRef = useRef<ScrollBoxRenderable>(null);

  // Auto-scroll to bottom when messages or typing state changes
  useEffect(() => {
    const sb = scrollRef.current;
    if (sb) {
      sb.scrollTop = sb.scrollHeight;
    }
  }, [messages, isTyping]);

  const renderMessage = (msg: ChatItem) => {
    const isUser = msg.role === "user";
    const isTool = msg.role === "tool";

    const bg: ColorInput | undefined = isUser
      ? "#1A1A24"
      : isTool
        ? "#1A1A24"
        : undefined;

    const labelColor: ColorInput = isUser
      ? "cyan"
      : isTool
        ? "yellow"
        : "#89B4FA";
    const textColor: ColorInput = isUser
      ? "white"
      : isTool
        ? "gray"
        : "white";
    const label = isUser
      ? "you"
      : isTool
        ? `● ${msg.toolName ?? "tool"}`
        : "WhoCodes";

    return (
      <box
        key={msg.id}
        flexDirection="column"
        backgroundColor={bg}
        border={["left"]}
        borderColor={labelColor}
        customBorderChars={{
          vertical: "┃",
          bottomLeft: isUser ? "╹" : "",
          horizontal: " ",
          topLeft: "",
          bottomRight: "",
          topRight: "",
          bottomT: "",
          topT: "",
          cross: "",
          leftT: "",
          rightT: "",
        }}
        paddingX={1}
        paddingY={0}
      >
        <text
          fg={labelColor}
          selectable={false}
          attributes={TextAttributes.NONE}
        >
          {label}
        </text>
        <text
          selectable={false}
          fg={textColor}
          attributes={TextAttributes.NONE}
        >
          {msg.content || "\u00A0"}
        </text>
      </box>
    );
  };

  return (
    <scrollbox
      ref={scrollRef}
      flexGrow={1}
      width="100%"
      flexDirection="column"
      padding={1}
    >
      {messages.length === 0 && !isTyping ? (
        <box alignItems="center" justifyContent="center">
          <text fg="gray" selectable={false} attributes={TextAttributes.NONE}>
            WhoCodes — minimal coding agent
          </text>
        </box>
      ) : (
        messages.map(renderMessage)
      )}

      {/* Typing indicator — appears at the bottom while agent is working */}
      {isTyping && (
        <box flexDirection="column" paddingX={1} paddingY={0}>
          <text fg="#89B4FA" selectable={false} attributes={TextAttributes.NONE}>
            WhoCodes
          </text>
          <text fg="gray" selectable={false} attributes={TextAttributes.NONE}>
            thinking...
          </text>
        </box>
      )}
    </scrollbox>
  );
};
