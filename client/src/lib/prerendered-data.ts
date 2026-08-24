export const PRERENDERED_DECK_DATA_SELECTOR = 'script[data-prerendered-deck="true"]';
export const PRERENDERED_SHOP_DATA_SELECTOR = 'script[data-prerendered-shop="true"]';

export function isPrerenderedDocument(): boolean {
  return typeof document !== "undefined" && document.getElementById("root")?.dataset.prerendered === "true";
}

export function readPrerenderedJson<T>(selector: string): T | undefined {
  if (typeof document === "undefined") return undefined;

  const serialized = document.querySelector(selector)?.textContent;
  if (!serialized) return undefined;

  try {
    return JSON.parse(serialized) as T;
  } catch {
    return undefined;
  }
}