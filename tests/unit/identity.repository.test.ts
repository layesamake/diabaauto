import { describe, expect, it } from "vitest";
import { toProfileRecord, type ProfileRow } from "@/repositories/identity.repository";

const customerRow: ProfileRow = {
  id: "profile-1",
  authUserId: "auth-1",
  userType: "CUSTOMER",
  status: "ACTIVE",
  customer: { id: "customer-1", resellerStatus: "PENDING" },
  staff: null,
};

const staffRow: ProfileRow = {
  id: "profile-9",
  authUserId: "auth-9",
  userType: "STAFF",
  status: "ACTIVE",
  customer: null,
  staff: {
    id: "staff-1",
    // Deux rôles (relation N:N `staff_roles`), avec une permission partagée pour éprouver la déduplication.
    roles: [
      {
        role: {
          code: "COMMERCIAL",
          permissions: [{ permission: { code: "order.view" } }, { permission: { code: "audit.view" } }],
        },
      },
      {
        role: {
          code: "ADMIN",
          permissions: [{ permission: { code: "role.manage" } }, { permission: { code: "audit.view" } }],
        },
      },
    ],
  },
};

describe("toProfileRecord", () => {
  it("maps a customer profile without leaking unrelated columns", () => {
    expect(toProfileRecord(customerRow)).toEqual({
      id: "profile-1",
      authUserId: "auth-1",
      userType: "CUSTOMER",
      status: "ACTIVE",
      customer: { id: "customer-1", resellerStatus: "PENDING" },
      staff: null,
    });
  });

  it("flattens the N:N roles of a staff profile and deduplicates the permissions union", () => {
    const record = toProfileRecord(staffRow);

    expect(record.staff?.roles).toEqual([
      { code: "ADMIN", permissions: ["audit.view", "role.manage"] },
      { code: "COMMERCIAL", permissions: ["audit.view", "order.view"] },
    ]);
    // Union dédupliquée et triée : `audit.view` n'apparaît qu'une fois.
    expect(record.staff?.permissions).toEqual(["audit.view", "order.view", "role.manage"]);
  });

  it("keeps a non-ACTIVE staff status so the actor stays downgraded by the service", () => {
    const record = toProfileRecord({ ...staffRow, status: "DISABLED" });
    expect(record.status).toBe("DISABLED");
    expect(record.staff?.roles).toHaveLength(2);
  });
});