import { describe, expect, it } from "vitest";
import {
  PERMISSION_CODES,
  PERMISSION_LABELS,
  PERMISSION_MODULES,
  ROLE_DEFINITIONS,
  ROLE_PERMISSION_MATRIX,
  type PermissionCodeFromSeed,
} from "@/prisma/seed-data";
import type { PermissionCode } from "@/services/permissions.service";

/**
 * Garde-fou anti-dérive : la matrice provisoire D01 (docs/decisions.md) est la seule source de droits
 * du seed. Ce test échoue si un droit est ajouté ou retiré sans décision explicite.
 */
const ADMIN_PERMISSIONS: PermissionCode[] = [...PERMISSION_CODES];

/** D01 : seules les permissions que les documents ne qualifient PAS de « sur habilitation ». */
const COMMERCIAL_PERMISSIONS: PermissionCode[] = [
  "vehicle.view",
  "customer.view",
  "lead.view",
  "lead.assign",
  "lead.update",
  "order.view",
  "order.create",
  "order.update",
  "reseller.view",
];

function permissionsOf(roleCode: "ADMIN" | "COMMERCIAL"): PermissionCode[] {
  return ROLE_PERMISSION_MATRIX.filter((row) => row.roleCode === roleCode)
    .map((row) => row.permissionCode)
    .sort();
}

describe("seed-data", () => {
  it("exposes the 26 documented permission codes, without duplicates", () => {
    expect(PERMISSION_CODES).toHaveLength(26);
    expect(new Set(PERMISSION_CODES).size).toBe(26);
    expect(permissionsOf("ADMIN")).toEqual([...ADMIN_PERMISSIONS].sort());
  });

  it("labels every permission exactly once", () => {
    expect(Object.keys(PERMISSION_LABELS).sort()).toEqual([...PERMISSION_CODES].sort());
  });

  it("assigns every permission to a non-empty canonical module (contrat §4.6)", () => {
    expect(Object.keys(PERMISSION_MODULES).sort()).toEqual([...PERMISSION_CODES].sort());

    for (const code of PERMISSION_CODES) {
      expect(PERMISSION_MODULES[code].trim().length).toBeGreaterThan(0);
    }
    // Regroupement imposé par le contrat : customer.* et reseller.* → customer, lead.* → crm.
    expect(PERMISSION_MODULES["vehicle.view"]).toBe("vehicle");
    expect(PERMISSION_MODULES["customer.edit"]).toBe("customer");
    expect(PERMISSION_MODULES["reseller.approve"]).toBe("customer");
    expect(PERMISSION_MODULES["lead.view"]).toBe("crm");
    expect(PERMISSION_MODULES["order.view"]).toBe("order");
    expect(PERMISSION_MODULES["content.manage"]).toBe("catalog");
    expect(PERMISSION_MODULES["audit.view"]).toBe("system");
    expect(PERMISSION_MODULES["storage.private_read"]).toBe("system");
  });

  it("describes every seeded role with a non-empty French description", () => {
    for (const role of ROLE_DEFINITIONS) {
      expect(role.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("seeds only the two roles documented by the specifications", () => {
    expect(ROLE_DEFINITIONS.map((role) => role.code).sort()).toEqual(["ADMIN", "COMMERCIAL"]);
  });

  it("grants the commercial role exactly the provisional D01 matrix", () => {
    expect(permissionsOf("COMMERCIAL")).toEqual([...COMMERCIAL_PERMISSIONS].sort());
  });

  it("keeps every explicit prohibition of the decision matrix for the commercial role", () => {
    for (const forbidden of [
      "reseller.approve",
      "reseller.reject",
      "reseller.suspend",
      "user.manage",
      "role.manage",
      "settings.manage",
      "audit.view",
      "vehicle.create",
      "vehicle.edit",
      "vehicle.publish",
      "vehicle.reserve",
      "vehicle.mark_sold",
      "vehicle.price_edit",
      "customer.edit",
    ] satisfies PermissionCodeFromSeed[]) {
      expect(permissionsOf("COMMERCIAL")).not.toContain(forbidden);
    }
  });

  it("never associates a permission with an unknown role or a duplicated pair", () => {
    const pairs = ROLE_PERMISSION_MATRIX.map((row) => `${row.roleCode}:${row.permissionCode}`);

    expect(new Set(pairs).size).toBe(pairs.length);
    for (const row of ROLE_PERMISSION_MATRIX) {
      expect(ROLE_DEFINITIONS.map((role) => role.code)).toContain(row.roleCode);
      expect(PERMISSION_CODES).toContain(row.permissionCode);
    }
  });

  it("keeps the permission codes aligned with the permission service contract", () => {
    const serviceCodes: PermissionCode[] = [
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

    expect([...PERMISSION_CODES].sort()).toEqual([...serviceCodes].sort());
  });
});
