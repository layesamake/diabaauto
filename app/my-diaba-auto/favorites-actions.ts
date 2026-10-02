"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "@/lib/auth/session";
import { newCorrelationId, ok, toErrorResponse, type ErrorEnvelope } from "@/lib/errors";
import { createFavoriteRepository } from "@/repositories/favorite.repository";
import {
  FavoriteValidationError,
  addFavorite,
  mergeFavoritesOnLogin,
  removeFavorite,
} from "@/services/favorite.service";

/**
 * Server Actions des favoris (My Diaba Auto) — contrat lot 4 §Sous-agent A.
 *
 * Même enveloppe normalisée que `app/my-diaba-auto/actions.ts` (T11/T13) : `data { message }` en
 * succès, `error { code, message, correlationId, fields? }` en échec. La cible vient toujours de
 * `getCurrentActor()`, jamais d'un identifiant transmis par le client.
 *
 * Décision technique (non précisée par le contrat) : `FavoriteButton` est un bouton autonome sans
 * formulaire HTML natif (pas de page dédiée à soumettre) ; les deux actions reçoivent donc des
 * arguments typés directement plutôt qu'un `FormData`, comme l'autorise une Server Action Next.js
 * appelée depuis un gestionnaire d'événement client. `toggleFavoriteAction` reçoit l'état cible
 * (`nextFavorite`) décidé côté client à partir de son état affiché, puis route vers `addFavorite`
 * ou `removeFavorite` ; la validation stricte de `vehicleId` reste entièrement côté service.
 */
export type FavoriteActionError = ErrorEnvelope["error"] & {
  /** Champs en cause lorsque l'erreur est une erreur de validation. */
  fields?: string[];
};

export type FavoriteActionState = { data: { message: string } } | { error: FavoriteActionError };

function toFavoriteActionState(error: unknown): FavoriteActionState {
  const envelope = toErrorResponse(error, { correlationId: newCorrelationId() });

  if (error instanceof FavoriteValidationError) {
    return { error: { ...envelope.error, fields: error.fields } };
  }

  return { error: envelope.error };
}

/** Ajoute ou retire un favori selon `nextFavorite` ; idempotent côté service et repository. */
export async function toggleFavoriteAction(
  vehicleId: string,
  nextFavorite: boolean,
): Promise<FavoriteActionState> {
  const actor = await getCurrentActor();

  try {
    if (nextFavorite) {
      await addFavorite(createFavoriteRepository(), actor, vehicleId);
    } else {
      await removeFavorite(createFavoriteRepository(), actor, vehicleId);
    }
  } catch (error) {
    return toFavoriteActionState(error);
  }

  revalidatePath("/my-diaba-auto");
  return ok({ message: nextFavorite ? "Véhicule ajouté à vos favoris." : "Véhicule retiré de vos favoris." });
}

/**
 * Fusionne les favoris locaux (visiteur) dans le compte, une fois après connexion (T34). Idempotente :
 * un appel répété (re-rendu, double clic) ne crée jamais de doublon. Le vidage du stockage local
 * reste à la charge de l'appelant client, après réception d'une réponse `data`.
 */
export async function mergeFavoritesAction(localVehicleIds: string[]): Promise<FavoriteActionState> {
  const actor = await getCurrentActor();

  try {
    await mergeFavoritesOnLogin(createFavoriteRepository(), actor, localVehicleIds);
  } catch (error) {
    return toFavoriteActionState(error);
  }

  revalidatePath("/my-diaba-auto");
  return ok({ message: "Vos favoris ont été synchronisés avec votre compte." });
}
