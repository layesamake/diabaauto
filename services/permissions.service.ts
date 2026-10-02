export type PermissionCode =
  | "vehicle.view"
  | "vehicle.create"
  | "vehicle.edit"
  | "vehicle.publish"
  | "vehicle.reserve"
  | "vehicle.mark_sold"
  | "vehicle.price_edit"
  | "customer.view"
  | "customer.edit"
  | "lead.view"
  | "lead.assign"
  | "lead.update"
  | "order.view"
  | "order.create"
  | "order.update"
  | "reseller.view"
  | "reseller.approve"
  | "reseller.reject"
  | "reseller.suspend"
  | "user.manage"
  | "role.manage"
  | "content.manage"
  | "settings.manage"
  | "analytics.view"
  | "audit.view"
  | "storage.private_read";

export type PermissionActor =
  | { kind: "visitor" }
  | { kind: "customer" }
  | { kind: "staff"; active: boolean; permissions: PermissionCode[] };

export function hasPermission(actor: PermissionActor, permission: PermissionCode): boolean {
  if (actor.kind !== "staff" || !actor.active) {
    return false;
  }

  return actor.permissions.includes(permission);
}
