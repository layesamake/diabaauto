import type { AdminActionState } from "@/app/admin/actions";

/**
 * Lecture des réponses des Server Actions du back-office côté formulaire
 * (patron `components/auth/form-state.ts`).
 *
 * Le serveur renvoie l'enveloppe normalisée `data { message }` / `error { code, message,
 * correlationId, fields? }` : ce module la traduit en état d'affichage, sans jamais exposer de
 * détail interne ni de valeur transmise.
 */

export type AdminFormStatus = { tone: "error" | "success"; message: string };

/** Message global : l'erreur du serveur est prioritaire sur le message initial de la page. */
export function adminFormStatus(state: AdminActionState | null, fallback = ""): AdminFormStatus {
  if (!state) {
    return { tone: "error", message: fallback };
  }

  if ("error" in state) {
    return { tone: "error", message: state.error.message };
  }

  return { tone: "success", message: state.data.message };
}

/** Message localisé d'un champ : générique et identique quelle que soit la valeur fautive. */
export function adminFieldMessage(
  state: AdminActionState | null,
  name: string,
  messages: Record<string, string>,
): string | null {
  if (!state || !("error" in state) || !state.error.fields?.includes(name)) {
    return null;
  }

  return messages[name] ?? "Valeur invalide pour ce champ.";
}

/** Destination de navigation confirmée par le serveur, ou `null`. */
export function adminRedirectTarget(state: AdminActionState | null): string | null {
  if (!state || !("data" in state)) {
    return null;
  }

  return state.data.redirectTo ?? null;
}
