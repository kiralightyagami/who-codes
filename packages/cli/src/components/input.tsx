import type { KeyBinding } from "@opentui/core";
import { EmptyBorder } from "./border";
import { StatusBar } from "./status-bar";

export const INPUT_KEY_BINDINGS: KeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "enter", action: "submit" },
  { name: "return", shift: true, action: "newline" },
  { name: "enter", shift: true, action: "newline" },
];

export const Input = ({
  onSubmit,
  disabled = false,
}: {
  onSubmit?: (text: string) => void;
  disabled?: boolean;
}) => {
  return (
    <box width={"100%"} alignItems="center">
      <box
        border={["left"]}
        borderColor={"cyan"}
        customBorderChars={{
          ...EmptyBorder,
          vertical: "┃",
          bottomLeft: "╹",
        }}
        width={"100%"}
      >
        <box
          position="relative"
          justifyContent="center"
          paddingX={2}
          paddingY={1}
          backgroundColor={"1A1A24"}
          width={"100%"}
          gap={1}
        >
          <textarea
            focused={!disabled}
            keyBindings={INPUT_KEY_BINDINGS}
            placeholder={`Cook anything... "Create GTA-VII make no mistake"`}
          />
          <StatusBar />
        </box>
      </box>
    </box>
  );
};
