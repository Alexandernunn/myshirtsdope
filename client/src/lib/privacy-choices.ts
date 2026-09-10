export type AdvertisingChoice = "allow" | "refuse" | "unset";

const STORAGE_KEY = "myshirtsdope-advertising-choice";
export const PRIVACY_CHOICE_EVENT = "myshirtsdope:privacy-choice";

function globalPrivacyControlEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function getAdvertisingChoice(): AdvertisingChoice {
  if (globalPrivacyControlEnabled()) return "refuse";
  if (typeof window === "undefined") return "unset";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "allow" || stored === "refuse" ? stored : "unset";
}

export function advertisingDataAllowed(): boolean {
  return getAdvertisingChoice() === "allow";
}

export function setAdvertisingChoice(choice: Exclude<AdvertisingChoice, "unset">): void {
  if (typeof window === "undefined") return;
  const effectiveChoice = globalPrivacyControlEnabled() ? "refuse" : choice;
  window.localStorage.setItem(STORAGE_KEY, effectiveChoice);
  window.dispatchEvent(new CustomEvent(PRIVACY_CHOICE_EVENT, { detail: effectiveChoice }));
}

export function globalPrivacyControlIsActive(): boolean {
  return globalPrivacyControlEnabled();
}