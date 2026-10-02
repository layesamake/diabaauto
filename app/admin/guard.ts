import type { Metadata } from "next";
import { getCurrentActor } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/errors";
import { requireStaff } from "@/services/access.service";
import type { Actor } from "@/services/identity.service";
import type { PermissionCode } from "@/services/permissions.service";

/**
 * Garde serveur des écrans du back-office.
 *
 * Ordre imposé (dev.md §6) : session vérifiée, statut de compte, puis permission — via
 * `requireStaff`, le seul point de garde réel. Un visiteur, un client ou un membre du personnel sans
 * la permission demandée reçoit un refus neutre, sans aucune donnée.
 */

export type AdminStaffActor = Extract<Actor, { kind: "staff" }>;

export type AdminAccess =
  | { granted: true; actor: AdminStaffActor }
  | { granted: false; denial: { code: string; message: string } };

export async function resolveAdminAccess(permission: PermissionCode): Promise<AdminAccess> {
  const actor = await getCurrentActor();

  try {
    const staff = requireStaff(actor, permission);
    return { granted: true, actor: staff };
  } catch (error) {
    return { granted: false, denial: toErrorResponse(error).error };
  }
}

/** Métadonnées communes aux écrans du back-office (doc 18 — exclusion de l'indexation). */
export function createAdminMetadata(title: string, description: string): Metadata {
  return {
    title,
    description,
    robots: { index: false, follow: false, nocache: true },
  };
}
