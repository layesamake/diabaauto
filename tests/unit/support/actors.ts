import type { Actor } from "@/services/identity.service";
import type { PermissionCode } from "@/services/permissions.service";

/**
 * Acteurs de test (doubles) — aucun accès à la base : les services sont éprouvés via leurs ports.
 * Aucun identifiant réel n'est utilisé, seulement des chaînes stables.
 */

export const ALL_PERMISSIONS: PermissionCode[] = [
  "vehicle.view",
  "vehicle.create",
  "vehicle.edit",
  "vehicle.publish",
  "vehicle.reserve",
  "vehicle.mark_sold",
  "vehicle.price_edit",
  "customer.view",
  "customer.edit",
  "lead.view",
  "lead.assign",
  "lead.update",
  "order.view",
  "order.create",
  "order.update",
  "reseller.view",
  "reseller.approve",
  "reseller.reject",
  "reseller.suspend",
  "user.manage",
  "role.manage",
  "content.manage",
  "settings.manage",
  "analytics.view",
  "audit.view",
  "storage.private_read",
];

/** Membre du personnel porteur des permissions fournies (par défaut : les 26). */
export function staffActor(permissions: PermissionCode[] = ALL_PERMISSIONS): Extract<Actor, { kind: "staff" }> {
  return {
    kind: "staff",
    profileId: "profile-staff",
    staffId: "staff-1",
    status: "ACTIVE",
    active: true,
    roles: [{ code: "ADMIN", permissions }],
    roleCodes: ["ADMIN"],
    permissions,
  };
}

export const visitorActor: Actor = { kind: "visitor" };

export const customerActor: Actor = {
  kind: "customer",
  profileId: "profile-customer",
  customerId: "customer-1",
  status: "ACTIVE",
  resellerStatus: "NOT_APPLICABLE",
};

export const APPROVED_RESELLER = { kind: "customer", resellerStatus: "APPROVED" } as const;
export const STANDARD_CUSTOMER = { kind: "customer", resellerStatus: "NOT_APPLICABLE" } as const;