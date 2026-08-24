import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
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
  const hasPrerenderedContent = root.dataset.prerendered === "true";
  if (hasPrerenderedContent) {
    try {
      await preloadCurrentRoute(window.location.pathname);
    } catch (error) {
      console.error("Unable to load the interactive storefront", error);
      return;
    }
  }

  const appRoot = createRoot(root);
  flushSync(() => {
    appRoot.render(<App />);
  });
  if (hasPrerenderedContent) delete root.dataset.prerendered;
}

void mountApp(rootElement);
