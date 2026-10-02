"use client";

/**
 * Bouton de déconnexion.
 *
 * La session est fermée par la Server Action (côté serveur) ; le composant affiche l'état de chargement
 * et garantit la sortie de l'espace privé même si la réponse de l'action interrompt la promesse
 * (redirection d'action serveur).
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOutAction } from "@/app/(auth)/actions";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    if (pending) {
      return;
    }

    setPending(true);

    try {
      await signOutAction();
    } catch {
      // Une redirection d'action serveur peut interrompre la promesse : la navigation ci-dessous couvre ce cas.
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <button
        type="button"
        onClick={handleSignOut}
        disabled={pending}
        aria-busy={pending}
        className="rounded-lg bg-[#0063DF] px-4 py-2.5 text-base font-semibold text-white hover:bg-[#0354A3] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Déconnexion…" : "Se déconnecter"}
      </button>
    </div>
  );
}
