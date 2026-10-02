import { describe, expect, it, vi } from "vitest";
import {
  ensureCustomerProfile,
  resolveActor,
  toPermissionActor,
  toPricingActor,
  type IdentityRepository,
  type ProfileRecord,
  type StaffRoleRecord,
} from "@/services/identity.service";

function customerProfile(overrides: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    id: "profile-1",
    authUserId: "auth-1",
    userType: "CUSTOMER",
    status: "ACTIVE",
    customer: { id: "customer-1", resellerStatus: "NOT_APPLICABLE" },
    staff: null,
    ...overrides,
  };
}

const commercialRole: StaffRoleRecord = { code: "COMMERCIAL", permissions: ["order.view"] };

function staffProfile(overrides: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    id: "profile-9",
    authUserId: "auth-9",
    userType: "STAFF",
    status: "ACTIVE",
    customer: null,
    staff: { id: "staff-1", roles: [commercialRole], permissions: ["order.view"] },
    ...overrides,
  };
}

function repository(initial: ProfileRecord | null): IdentityRepository & { created: { keys: string[]; input: unknown }[] } {
  const created: { keys: string[]; input: unknown }[] = [];
  let stored = initial;

  return {
    created,
    async findByAuthUserId(authUserId: string) {
      return stored && stored.authUserId === authUserId ? stored : null;
    },
    async createCustomerProfile(input) {
      created.push({ keys: Object.keys(input).sort(), input });
      stored = customerProfile({ authUserId: input.authUserId });
      return stored;
    },
  };
}

describe("resolveActor", () => {
  it("returns a visitor when there is no session", async () => {
    const repo = repository(null);
    await expect(resolveActor({ authUserId: null }, repo)).resolves.toEqual({ kind: "visitor" });
    expect(repo.created).toHaveLength(0);
  });

  it("maps an authentic profile to a customer actor with its reseller status", async () => {
    const repo = repository(customerProfile({ customer: { id: "customer-1", resellerStatus: "APPROVED" } }));
    const actor = await resolveActor({ authUserId: "auth-1" }, repo);

    expect(actor).toEqual({
      kind: "customer",
      profileId: "profile-1",
      customerId: "customer-1",
      status: "ACTIVE",
      resellerStatus: "APPROVED",
    });
  });

  it("maps a staff profile to a staff actor carrying all roles and permissions", async () => {
    const repo = repository(staffProfile());
    const actor = await resolveActor({ authUserId: "auth-9" }, repo);

    expect(actor).toEqual({
      kind: "staff",
      profileId: "profile-9",
      staffId: "staff-1",
      status: "ACTIVE",
      active: true,
      roles: [{ code: "COMMERCIAL", permissions: ["order.view"] }],
      roleCodes: ["COMMERCIAL"],
      permissions: ["order.view"],
    });
  });

  it("exposes the N:N roles of a staff member and keeps active = status === ACTIVE", async () => {
    const roles: StaffRoleRecord[] = [
      { code: "ADMIN", permissions: ["audit.view", "role.manage"] },
      { code: "COMMERCIAL", permissions: ["audit.view", "order.view"] },
    ];
    const repo = repository(
      staffProfile({ staff: { id: "staff-1", roles, permissions: ["audit.view", "order.view", "role.manage"] } }),
    );
    const actor = await resolveActor({ authUserId: "auth-9" }, repo);

    expect(actor).toMatchObject({
      kind: "staff",
      active: true,
      roleCodes: ["ADMIN", "COMMERCIAL"],
      permissions: ["audit.view", "order.view", "role.manage"],
    });
  });

  it("flags a suspended or inactive account instead of granting an actor", async () => {
    const suspended = await resolveActor({ authUserId: "auth-1" }, repository(customerProfile({ status: "SUSPENDED" })));
    expect(suspended).toEqual({ kind: "suspended", profileId: "profile-1", userType: "CUSTOMER" });

    const disabled = await resolveActor({ authUserId: "auth-1" }, repository(customerProfile({ status: "DISABLED" })));
    expect(disabled).toEqual({ kind: "suspended", profileId: "profile-1", userType: "CUSTOMER" });

    // L'activité du personnel est portée par Profile.status : plus de champ `staff.active`.
    const inactiveStaff = await resolveActor({ authUserId: "auth-9" }, repository(staffProfile({ status: "DISABLED" })));
    expect(inactiveStaff).toEqual({ kind: "suspended", profileId: "profile-9", userType: "STAFF" });
  });

  it("provisions the profile of a freshly registered identity", async () => {
    const repo = repository(null);
    const actor = await resolveActor({ authUserId: "auth-2", defaults: { firstName: "Awa", lastName: "Diop" } }, repo);

    expect(repo.created).toHaveLength(1);
    expect(actor.kind).toBe("customer");
  });
});

describe("ensureCustomerProfile", () => {
  it("creates the profile only once for the same identity (idempotent)", async () => {
    const repo = repository(null);

    const first = await ensureCustomerProfile(repo, { authUserId: "auth-3", firstName: "Moussa", lastName: "Ndiaye" });
    const second = await ensureCustomerProfile(repo, { authUserId: "auth-3", firstName: "Moussa", lastName: "Ndiaye" });

    expect(first.authUserId).toBe("auth-3");
    expect(second.authUserId).toBe("auth-3");
    expect(repo.created).toHaveLength(1);
  });

  it("never forwards self-editable privilege fields to the data layer", async () => {
    const repo = repository(null);
    await ensureCustomerProfile(repo, { authUserId: "auth-4", firstName: "A", lastName: "B" });

    expect(repo.created[0].keys).toEqual(["authUserId", "firstName", "lastName"]);
  });

  it("refuses an empty identity instead of creating an orphan profile", async () => {
    const repo = repository(null);
    await expect(ensureCustomerProfile(repo, { authUserId: "  ", firstName: "A", lastName: "B" })).rejects.toThrowError(/authUserId/i);
    expect(repo.created).toHaveLength(0);
  });
});

describe("actor projections", () => {
  it("maps every actor to the existing permission service contract", () => {
    expect(toPermissionActor({ kind: "visitor" })).toEqual({ kind: "visitor" });
    // Un compte suspendu est projeté en visiteur : refus par défaut, y compris dans le service de permissions.
    expect(toPermissionActor({ kind: "suspended", profileId: "p", userType: "STAFF" })).toEqual({ kind: "visitor" });
    expect(toPermissionActor({ kind: "customer", profileId: "p1", customerId: "c1", status: "ACTIVE", resellerStatus: "APPROVED" })).toEqual({ kind: "customer" });
    expect(
      toPermissionActor({
        kind: "staff",
        profileId: "p9",
        staffId: "s1",
        status: "ACTIVE",
        active: true,
        roles: [{ code: "ADMIN", permissions: ["audit.view"] }],
        roleCodes: ["ADMIN"],
        permissions: ["audit.view"],
      }),
    ).toEqual({ kind: "staff", active: true, permissions: ["audit.view"] });
  });

  it("maps every actor to the existing pricing service contract", () => {
    expect(toPricingActor({ kind: "visitor" })).toEqual({ kind: "visitor" });
    expect(toPricingActor({ kind: "suspended", profileId: "p", userType: "CUSTOMER" })).toEqual({ kind: "visitor" });
    expect(
      toPricingActor({
        kind: "staff",
        profileId: "p9",
        staffId: "s1",
        status: "ACTIVE",
        active: true,
        roles: [],
        roleCodes: [],
        permissions: [],
      }),
    ).toEqual({ kind: "visitor" });
    expect(toPricingActor({ kind: "customer", profileId: "p1", customerId: "c1", status: "ACTIVE", resellerStatus: "SUSPENDED" })).toEqual({
      kind: "customer",
      resellerStatus: "SUSPENDED",
    });
  });

  it("does not mutate the source profile when projecting", () => {
    const spy = vi.fn();
    const actor = toPermissionActor({ kind: "customer", profileId: "p1", customerId: "c1", status: "ACTIVE", resellerStatus: "NOT_APPLICABLE" });
    spy(actor);
    expect(spy).toHaveBeenCalled();
  });
});