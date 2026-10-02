import { describe, expect, it, vi } from "vitest";
import {
  parseCustomerProfileUpdate,
  readOwnCustomerProfile,
  updateOwnCustomerProfile,
  type CustomerProfileRepository,
} from "@/services/profile.service";
import type { Actor } from "@/services/identity.service";

const customer: Actor = { kind: "customer", profileId: "p1", customerId: "c1", status: "ACTIVE", resellerStatus: "NOT_APPLICABLE" };
const otherCustomer: Actor = { kind: "customer", profileId: "p2", customerId: "c2", status: "ACTIVE", resellerStatus: "NOT_APPLICABLE" };
const visitor: Actor = { kind: "visitor" };

function repository(): CustomerProfileRepository & { updates: { customerId: string; data: unknown }[] } {
  const updates: { customerId: string; data: unknown }[] = [];
  const row = {
    firstName: "Awa",
    lastName: "Diop",
    phone: "+221771234567",
    whatsapp: null,
    city: "Dakar",
    country: "Sénégal",
    resellerStatus: "NOT_APPLICABLE",
  };

  return {
    updates,
    async readProfile() {
      return row;
    },
    async updateProfile(customerId, data) {
      updates.push({ customerId, data });
      return { ...row, ...data };
    },
  };
}

describe("parseCustomerProfileUpdate", () => {
  it("accepts the personal fields allowed by the specifications", () => {
    const parsed = parseCustomerProfileUpdate({ firstName: " Awa ", lastName: "Diop", city: "Dakar", phone: null });
    expect(parsed).toEqual({ firstName: "Awa", lastName: "Diop", city: "Dakar", phone: null });
  });

  it("rejects every self-editable privilege field", () => {
    for (const field of [
      "userType",
      "status",
      "resellerStatus",
      "pricingProfile",
      "segment",
      "roleCodes",
      "roles",
      "profileId",
      "customerId",
    ]) {
      expect(() => parseCustomerProfileUpdate({ firstName: "A", lastName: "B", [field]: "STAFF" })).toThrowError(
        new RegExp(field),
      );
    }
  });

  it("rejects unknown fields instead of ignoring them", () => {
    expect(() => parseCustomerProfileUpdate({ firstName: "A", lastName: "B", nickname: "x" })).toThrowError(/nickname/);
  });

  it("rejects an empty name and never echoes the offending value", () => {
    let message = "";
    try {
      parseCustomerProfileUpdate({ firstName: "   ", lastName: "B" });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("firstName");
    expect(message).not.toContain("   ");
  });
});

describe("customer profile access", () => {
  it("requires an authenticated customer", async () => {
    const repo = repository();
    await expect(readOwnCustomerProfile(repo, visitor)).rejects.toThrowError(/authent/i);
    await expect(updateOwnCustomerProfile(repo, visitor, { firstName: "A", lastName: "B" })).rejects.toThrowError(/authent/i);
  });

  it("only ever touches the caller's own profile", async () => {
    const repo = repository();
    await updateOwnCustomerProfile(repo, customer, { firstName: "A", lastName: "B" });
    expect(repo.updates).toEqual([{ customerId: "c1", data: { firstName: "A", lastName: "B" } }]);
  });

  it("never lets a caller target another customer's profile", async () => {
    const repo = repository();
    const spy = vi.spyOn(repo, "readProfile");
    await readOwnCustomerProfile(repo, otherCustomer);

    // La cible n'est jamais fournie par l'appelant : elle vient de l'acteur résolu côté serveur.
    expect(spy).toHaveBeenCalledWith("c2");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("returns only explicitly selected fields", async () => {
    const repo = repository();
    const view = await readOwnCustomerProfile(repo, customer);

    expect(Object.keys(view).sort()).toEqual([
      "city",
      "country",
      "firstName",
      "lastName",
      "phone",
      "resellerStatus",
      "whatsapp",
    ]);
  });

  it("never forwards a privilege field to the data layer", async () => {
    const repo = repository();
    await expect(
      updateOwnCustomerProfile(repo, customer, { firstName: "A", lastName: "B", resellerStatus: "APPROVED" }),
    ).rejects.toThrowError(/resellerStatus/);
    expect(repo.updates).toHaveLength(0);
  });
});
