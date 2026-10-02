"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "@/lib/auth/session";
import { newCorrelationId, ok, toErrorResponse, type ErrorEnvelope } from "@/lib/errors";
import {
  createSavedSearch,
  removeSavedSearch,
  SavedSearchValidationError,
} from "@/services/saved-search.service";

/**
 * Server Actions de « My Diaba Auto » — recherches enregistrées (contrat lot 4 §2 « Sous-agent B »).
 *
 * Même enveloppe normalisée que `app/my-diaba-auto/actions.ts` (T11/T13) : `data { message }` en
 * succès, `error { code, message, correlationId, fields? }` en échec. La cible (`customerId`) vient
 * toujours de l'acteur résolu côté serveur via `getCurrentActor()`, jamais du formulaire.
 *
 * `filters` est transmis en JSON (champ `filters` du formulaire) : un corps malformé est traité
 * comme un objet vide par `createSavedSearchAction`, qui laisse alors `parseCatalogueFilters`
 * (réutilisé par le service) rejeter toute clé effectivement invalide.
 */
export type SavedSearchActionError = ErrorEnvelope["error"] & {
  /** Champs en cause lorsque l'erreur est une erreur de validation. */
  fields?: string[];
};

export type SavedSearchActionState = { data: { message: string } } | { error: SavedSearchActionError };

function parseFiltersField(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string" || raw.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    // Une charge JSON invalide est traitée comme « aucun filtre » : le service la validera quand même
    // (clé inconnue ou type invalide), jamais de passage direct à la base.
    return {};
  }
}

/** Création d'une recherche enregistrée pour le client connecté. */
export async function createSavedSearchAction(formData: FormData): Promise<SavedSearchActionState> {
  const actor = await getCurrentActor();

  try {
    await createSavedSearch(actor, {
      name: formData.get("name"),
      notificationsEnabled: formData.get("notificationsEnabled") === "true",
      filters: parseFiltersField(formData.get("filters")),
    });
  } catch (error) {
    const envelope = toErrorResponse(error, { correlationId: newCorrelationId() });

    if (error instanceof SavedSearchValidationError) {
      return { error: { ...envelope.error, fields: error.fields } };
    }

    return { error: envelope.error };
  }

  revalidatePath("/my-diaba-auto");
  return ok({ message: "Votre recherche a été enregistrée." });
}

/** Suppression d'une recherche enregistrée appartenant au client connecté. */
export async function removeSavedSearchAction(formData: FormData): Promise<SavedSearchActionState> {
  const actor = await getCurrentActor();

  try {
    await removeSavedSearch(actor, formData.get("id"));
  } catch (error) {
    return { error: toErrorResponse(error, { correlationId: newCorrelationId() }).error };
  }

  revalidatePath("/my-diaba-auto");
  return ok({ message: "La recherche a été supprimée." });
}
