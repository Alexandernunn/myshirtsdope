import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root element");
}

if (rootElement.dataset.prerendered === "true") {
  rootElement.replaceChildren();
}

createRoot(rootElement).render(<App />);
