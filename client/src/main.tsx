import { createRoot } from "react-dom/client";
import App, { preloadCurrentRoute, trackInitialPageView } from "./App";
import { deferMarketingScriptsUntilInteraction } from "./lib/marketing-scripts";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root element");
}

document
  .querySelectorAll<HTMLLinkElement>('link[data-deferred-stylesheet="true"]')
  .forEach((stylesheet) => {
    let activated = false;
    const activate = () => {
      if (activated) return;
      activated = true;
      stylesheet.rel = "stylesheet";
      stylesheet.removeAttribute("data-deferred-stylesheet");
    };

    stylesheet.addEventListener("load", activate, { once: true });

    const alreadyLoaded = performance
      .getEntriesByName(stylesheet.href, "resource")
      .some((entry) => (entry as PerformanceResourceTiming).responseEnd > 0);
    if (alreadyLoaded) activate();
  });

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
