"use client";

import { CONSENT_REOPEN_EVENT } from "@/lib/analytics/consent";

/** Rouvre le bandeau de consentement. Le parent ne l'affiche que si la mesure est configurée. */
export function CookiePreferencesButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(CONSENT_REOPEN_EVENT))}
      className="underline underline-offset-2 hover:text-[#66E5FC]"
    >
      Gérer les cookies
    </button>
  );
}
