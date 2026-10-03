import { cache } from "react";
import { createIdentityRepository } from "@/repositories/identity.repository";
import { getVerifiedAuthUser } from "@/lib/supabase/server";
import { resolveActor, type Actor } from "@/services/identity.service";

/**
 * Acteur serveur de la requête courante.
 *
 * Ordre imposé (CLAUDE.md §6) : 1) session vérifiée côté serveur, 2) statut du compte, 3) permission,
 * 4) portée et propriété. Cette fonction couvre les étapes 1 et 2 ; les gardes de
 * `services/access.service.ts` couvrent les étapes 3 et 4.
 *
 * `cache` déduplique les appels dans une même requête React (pas de cache partagé entre utilisateurs).
 */
export const getCurrentActor = cache(async (): Promise<Actor> => {
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    return { kind: "visitor" };
  }

  return resolveActor({ authUserId: authUser.id }, createIdentityRepository());
});
