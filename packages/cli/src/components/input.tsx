import { EmptyBorder } from "./border";
import { StatusBar } from "./status-bar";


export const Input = ({onSubmit, disabled = false}: {
    onSubmit?: (text:string) => void;
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
                placeholder={`Cook anything... "Create GTA-VII make no mistake"`}
            />
            <StatusBar/>
            </box>
            
        </box>
    </box>
  )
}
