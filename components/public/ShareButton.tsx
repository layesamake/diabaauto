"use client";

import { useState } from "react";
import { fr } from "@/lib/i18n";

/**
 * Bouton de partage (doc 05 §3). Utilise l'API de partage native quand elle existe, sinon copie le
 * lien. Aucun échec n'est présenté comme une erreur bloquante.
 */
export function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title, url });
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        return;
      }

      setCopied(false);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-[#011D4F] hover:border-[#0063DF]"
    >
      {copied ? fr.common.shareCopied : fr.common.share}
    </button>
  );
}