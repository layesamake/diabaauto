import { describe, expect, it } from "vitest";
import {
  assertOwnProfile,
  assertOwnership,
  requireAuthenticated,
  requireCustomer,
  requireStaff,
} from "@/services/access.service";
import type { Actor } from "@/services/identity.service";

const visitor: Actor = { kind: "visitor" };
const customer: Actor = { kind: "customer", profileId: "p1", customerId: "c1", status: "ACTIVE", resellerStatus: "NOT_APPLICABLE" };
const suspended: Actor = { kind: "suspended", profileId: "p2", userType: "CUSTOMER" };
const commercial: Actor = {
  kind: "staff",
  profileId: "p9",
  staffId: "s9",
  status: "ACTIVE",
  active: true,
  roles: [{ code: "COMMERCIAL", permissions: ["order.view", "lead.view"] }],
  roleCodes: ["COMMERCIAL"],
  permissions: ["order.view", "lead.view"],
};
const admin: Actor = {
  kind: "staff",
  profileId: "p0",
  staffId: "s0",
  status: "ACTIVE",
  active: true,
  roles: [{ code: "ADMIN", permissions: ["role.manage", "audit.view", "storage.private_read"] }],
  roleCodes: ["ADMIN"],
  permissions: ["role.manage", "audit.view", "storage.private_read"],
};

describe("access guards", () => {
  it("rejects unauthenticated actors with UNAUTHENTICATED (T10 baseline)", () => {
    expect(() => requireStaff(visitor, "vehicle.create")).toThrowError(/authent/i);
    expect(() => requireCustomer(visitor)).toThrowError(/authent/i);
    expect(() => requireAuthenticated(customer)).not.toThrow();
  });

  it("rejects a suspended or inactive account before evaluating permissions", () => {
    expect(() => requireStaff(suspended, "audit.view")).toThrowError(/authent/i);
    expect(() => requireCustomer(suspended)).toThrowError(/authent/i);
  });

  it("refuses a customer calling a staff-only action on the server side (T10)", () => {
    let code = "";
    try {
      requireStaff(customer, "vehicle.create");
    } catch (error) {
      code = (error as { code: string }).code;
    }
    expect(code).toBe("FORBIDDEN");
  });

  it("refuses a commercial acting outside its grants and mutates nothing (T12)", () => {
    expect(() => requireStaff(commercial, "role.manage")).toThrowError(/refus/i);
    expect(() => requireStaff(commercial, "reseller.approve")).toThrowError(/refus/i);
    expect(requireStaff(commercial, "order.view")).toEqual(commercial);
  });

  it("never reveals whether a private resource exists", () => {
    const forbidden = (() => {
      try {
        assertOwnership(customer, { customerId: "c2" });
      } catch (error) {
        return error as { code: string; message: string };
      }
      return null;
    })();

    expect(forbidden?.code).toBe("NOT_FOUND");
    expect(forbidden?.message).not.toContain("c2");
    expect(() => assertOwnership(customer, { customerId: "c1" })).not.toThrow();
    expect(() => assertOwnership(admin, { customerId: "c2" })).not.toThrow();
  });

  it("protects a customer profile from another customer and from unauthenticated actors", () => {
    expect(() => assertOwnProfile(customer, "p1")).not.toThrow();
    expect(() => assertOwnProfile(customer, "p3")).toThrowError(/introuvable/i);
    expect(() => assertOwnProfile(visitor, "p1")).toThrowError(/authent/i);
  });
});
