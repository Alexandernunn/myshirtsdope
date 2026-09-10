import { useEffect, useState } from "react";
import {
  getAdvertisingChoice,
  globalPrivacyControlIsActive,
  PRIVACY_CHOICE_EVENT,
  setAdvertisingChoice,
  type AdvertisingChoice,
} from "@/lib/privacy-choices";

export default function PrivacyChoices() {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<AdvertisingChoice>("unset");
  const [gpcActive, setGpcActive] = useState(false);

  useEffect(() => {
    setChoice(getAdvertisingChoice());
    setGpcActive(globalPrivacyControlIsActive());
    const openDialog = () => setOpen(true);
    window.addEventListener("myshirtsdope:open-privacy-choices", openDialog);
    return () => window.removeEventListener("myshirtsdope:open-privacy-choices", openDialog);
  }, []);

  const save = (nextChoice: "allow" | "refuse") => {
    setAdvertisingChoice(nextChoice);
    setChoice(getAdvertisingChoice());
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-choices-title"
        aria-describedby="privacy-choices-description"
        className="w-full max-w-lg rounded-lg border border-neon-blue/50 bg-background p-6 shadow-2xl"
      >
        <h2 id="privacy-choices-title" className="font-pixel text-sm text-neon-blue">
          PRIVACY CHOICES
        </h2>
        <p id="privacy-choices-description" className="mt-4 font-display text-base leading-relaxed text-muted-foreground">
          Choose whether MyShirtsDope may send storefront activity and identifiers to Google and Meta for advertising measurement. Essential store features work either way.
        </p>
        {gpcActive && (
          <p className="mt-3 rounded border border-neon-green/50 p-3 font-display text-sm text-neon-green" role="status">
            Your browser’s Global Privacy Control signal is active, so advertising data sharing is refused.
          </p>
        )}
        {!gpcActive && choice !== "unset" && (
          <p className="mt-3 font-display text-sm text-muted-foreground" role="status">
            Current choice: {choice === "allow" ? "Allow advertising data sharing" : "Refuse advertising data sharing"}.
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => save("refuse")}
            className="min-h-11 rounded border border-border px-4 py-2 font-display text-base hover:bg-muted"
          >
            Refuse
          </button>
          <button
            type="button"
            onClick={() => save("allow")}
            disabled={gpcActive}
            className="min-h-11 rounded bg-neon-blue px-4 py-2 font-display text-base text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            Allow
          </button>
        </div>
      </section>
    </div>
  );
}

export function openPrivacyChoices(): void {
  window.dispatchEvent(new Event("myshirtsdope:open-privacy-choices"));
}