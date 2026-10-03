import { AppError } from "@/lib/errors";
import { hasPermission, type PermissionCode } from "@/services/permissions.service";
import { toPermissionActor, type Actor } from "@/services/identity.service";

/**
 * Gardes d'accès serveur — ordre imposé par CLAUDE.md §6 et le doc 10 :
 * 1) session, 2) statut du compte, 3) permission, 4) portée et propriété.
 * La validation des entrées (5) et l'exécution + audit (6) restent aux appelants.
 *
 * Masquer une action dans l'interface ne constitue pas une autorisation : ces gardes sont le seul
 * point d'entrée des Server Actions et Route Handlers privés.
 */

const UNAUTHENTICATED_MESSAGE = "Authentification requise.";
const FORBIDDEN_MESSAGE = "Accès refusé.";
const NOT_FOUND_MESSAGE = "Ressource introuvable.";

export function requireAuthenticated(actor: Actor): Exclude<Actor, { kind: "visitor" } | { kind: "suspended" }> {
  if (actor.kind === "visitor" || actor.kind === "suspended") {
    throw new AppError("UNAUTHENTICATED", UNAUTHENTICATED_MESSAGE);
  }

  return actor;
}

export function requireCustomer(actor: Actor): Extract<Actor, { kind: "customer" }> {
  const authenticated = requireAuthenticated(actor);
  if (authenticated.kind !== "customer") {
    throw new AppError("FORBIDDEN", FORBIDDEN_MESSAGE);
  }

  return authenticated;
}

export function requireStaff(actor: Actor, permission: PermissionCode): Extract<Actor, { kind: "staff" }> {
  const authenticated = requireAuthenticated(actor);
  if (authenticated.kind !== "staff") {
    throw new AppError("FORBIDDEN", FORBIDDEN_MESSAGE);
  }

  if (!hasPermission(toPermissionActor(authenticated), permission)) {
    throw new AppError("FORBIDDEN", FORBIDDEN_MESSAGE);
  }

  return authenticated;
}

/**
 * Contrôle de propriété d'une ressource privée.
 * Un acteur non propriétaire reçoit NOT_FOUND — jamais FORBIDDEN — pour ne pas révéler
 * l'existence d'une ressource privée (doc 07, critères de recette).
 */
export function assertOwnership(actor: Actor, resource: { customerId: string }): void {
  const authenticated = requireAuthenticated(actor);
  if (authenticated.kind === "staff") {
    return;
  }

  if (authenticated.customerId !== resource.customerId) {
    throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
  }
}

/** Contrôle de propriété d'un profil client (My Diaba Auto). */
export function assertOwnProfile(actor: Actor, profileId: string): void {
  const authenticated = requireAuthenticated(actor);
  if (authenticated.kind === "staff") {
    return;
  }

  if (authenticated.profileId !== profileId) {
    throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
  }
}
