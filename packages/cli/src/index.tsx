import { createCliRenderer} from "@opentui/core";
import { createRoot } from "@opentui/react";
import { Header } from "./components/header";

function App() {
  return (
    <box 
    alignItems="center" 
    justifyContent="center"
    backgroundColor="#0D0D09" 
    flexGrow={1}>
        <Header/>
    </box>
  );
}

const renderer = await createCliRenderer();
createRoot(renderer).render(<App />);
