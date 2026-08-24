import { createRoot } from "react-dom/client";
import App, { preloadCurrentRoute, trackInitialPageView } from "./App";
import { deferMarketingScriptsUntilInteraction } from "./lib/marketing-scripts";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root element");
}

deferMarketingScriptsUntilInteraction();
trackInitialPageView(window.location.pathname);

async function mountApp(root: HTMLElement) {
  if (root.dataset.prerendered === "true") {
    try {
      await preloadCurrentRoute(window.location.pathname);
    } catch (error) {
      console.error("Unable to load the interactive storefront", error);
      return;
    }
    root.replaceChildren();
  }

  createRoot(root).render(<App />);
}

void mountApp(rootElement);
