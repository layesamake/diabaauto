"use client";

import { useState } from "react";

/**
 * Déconnexion. Le bouton n'effectue l'opération qu'après confirmation du serveur :
 * aucun succès n'est simulé côté navigateur (dev.md §4).
 * Composant client minimal ; l'action serveur applique les contrôles d'accès.
 */
export function LogoutButton({ action }: { action: () => Promise<unknown> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setError(null);
    setPending(true);

    try {
      await action();
    } catch {
      // Une redirection d'action serveur peut interrompre la promesse : ne rien afficher alors.
      setError("La déconnexion n'a pas pu aboutir. Réessayez.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleLogout}
        disabled={pending}
        aria-busy={pending}
        className="rounded-lg border border-[#0063DF] px-4 py-2 text-sm font-semibold text-[#0063DF] hover:bg-[#e8f4ff] hover:text-[#0354A3] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Déconnexion…" : "Se déconnecter"}
      </button>
      <p role="alert" aria-live="polite" className="text-sm text-[#95312a]">
        {error ?? ""}
      </p>
    </div>
  );
}
