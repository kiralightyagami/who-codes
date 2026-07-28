import { createCliRenderer} from "@opentui/core";
import { createRoot } from "@opentui/react";
import { Header } from "./components/header";
import { Input } from "./components/input";

function App() {
  return (
    <box 
    alignItems="center" 
    justifyContent="center"
    backgroundColor="#0D0D09" 
    flexGrow={1}
    gap={2}
    >
        <Header/>
        <box width={"100%"} maxWidth={78} paddingX={2}>
        <Input onSubmit={() => {}}/>
        </box>
    </box>
  );
}

const renderer = await createCliRenderer();
createRoot(renderer).render(<App />);
