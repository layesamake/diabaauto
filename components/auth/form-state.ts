/**
 * Lecture des réponses des Server Actions d'authentification côté formulaire.
 *
 * Le serveur renvoie l'enveloppe normalisée `data` / `error { code, message, correlationId, fields }` :
 * ce module la traduit en état d'affichage, sans jamais exposer de détail interne ni de valeur saisie.
 */

import type { AuthActionState } from "@/app/(auth)/actions";

export type FormStatus = { tone: "error" | "success"; message: string };

/** Message global : l'erreur du serveur est prioritaire sur le message initial de la page. */
export function formStatus(state: AuthActionState | null, fallback = ""): FormStatus {
  if (!state) {
    return { tone: "error", message: fallback };
  }

  if ("error" in state) {
    return { tone: "error", message: state.error.message };
  }

  return { tone: "success", message: state.data.message };
}

/** Message localisé d'un champ : générique et identique quelle que soit la valeur fautive. */
export function fieldMessage(
  state: AuthActionState | null,
  name: string,
  messages: Record<string, string>,
): string | null {
  if (!state || !("error" in state) || !state.error.fields?.includes(name)) {
    return null;
  }

  return messages[name] ?? "Valeur invalide pour ce champ.";
}

/** Destination de navigation confirmée par le serveur, ou `null`. */
export function redirectTarget(state: AuthActionState | null): string | null {
  if (!state || !("data" in state)) {
    return null;
  }

  return state.data.redirectTo;
}
