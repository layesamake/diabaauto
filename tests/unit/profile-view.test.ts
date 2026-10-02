import { describe, expect, it } from "vitest";
import {
  describeResellerStatus,
  displayFieldValue,
  EMPTY_FIELD_LABEL,
  profileDisplayName,
  profileFields,
  resellerStatusLabels,
  resolveMyDiabaAutoMode,
  unknownResellerStatus,
} from "@/components/profile/profile-view";
import type { Actor } from "@/services/identity.service";
import type { ResellerStatus } from "@/services/pricing.service";

const visitor: Actor = { kind: "visitor" };
const customer: Actor = { kind: "customer", profileId: "p1", customerId: "c1", status: "ACTIVE", resellerStatus: "NOT_APPLICABLE" };
const suspended: Actor = { kind: "suspended", profileId: "p1", userType: "CUSTOMER" };
const staff: Actor = {
  kind: "staff",
  profileId: "p9",
  staffId: "s1",
  status: "ACTIVE",
  active: true,
  roles: [{ code: "ADMIN", permissions: [] }],
  roleCodes: ["ADMIN"],
  permissions: [],
};

const allStatuses: ResellerStatus[] = ["NOT_APPLICABLE", "PENDING", "APPROVED", "REJECTED", "SUSPENDED"];

describe("reseller status labels", () => {
  it("covers every documented status with a distinct readable label", () => {
    const labels = allStatuses.map((status) => resellerStatusLabels[status].label);

    expect(new Set(labels).size).toBe(allStatuses.length);
    for (const label of labels) {
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });

  it("describes each status without inventing a number, an address or a commercial promise", () => {
    for (const status of allStatuses) {
      const view = resellerStatusLabels[status];

      expect(view.description.trim().length).toBeGreaterThan(0);
      // Aucun chiffre, montant, numéro ni adresse n'est inventé dans les libellés.
      expect(view.label).not.toMatch(/\d/);
      expect(view.description).not.toMatch(/\d/);
    }
  });

  it("falls back to a neutral label for an unknown status", () => {
    expect(describeResellerStatus("APPROVED")).toBe(resellerStatusLabels.APPROVED);
    expect(describeResellerStatus("REVERSED")).toBe(unknownResellerStatus);
    expect(describeResellerStatus("")).toBe(unknownResellerStatus);
  });
});

describe("resolveMyDiabaAutoMode", () => {
  it("keeps a visitor out of the private space", () => {
    expect(resolveMyDiabaAutoMode(visitor)).toBe("visitor");
  });

  it("routes a suspended account to the read-only state", () => {
    expect(resolveMyDiabaAutoMode(suspended)).toBe("suspended");
  });

  it("serves the dashboard to an active customer only", () => {
    expect(resolveMyDiabaAutoMode(customer)).toBe("customer");
  });

  it("treats a staff session as a non-customer space", () => {
    expect(resolveMyDiabaAutoMode(staff)).toBe("staff");
  });
});

describe("profile presentation helpers", () => {
  it("builds a readable display name and never returns an empty one", () => {
    expect(profileDisplayName({ firstName: "Awa", lastName: "Diop" })).toBe("Awa Diop");
    expect(profileDisplayName({ firstName: "  Awa ", lastName: " Diop  " })).toBe("Awa Diop");
    expect(profileDisplayName({ firstName: "", lastName: "" })).toBe("Profil client");
  });

  it("lists the personal fields in a stable order with French labels", () => {
    const fields = profileFields({
      firstName: "Awa",
      lastName: "Diop",
      phone: null,
      whatsapp: null,
      city: null,
      country: null,
    });

    expect(fields.map((field) => field.id)).toEqual([
      "firstName",
      "lastName",
      "phone",
      "whatsapp",
      "city",
      "country",
    ]);
    expect(fields.map((field) => field.label)).toEqual([
      "Prénom",
      "Nom",
      "Téléphone",
      "WhatsApp",
      "Ville",
      "Pays",
    ]);
  });

  it("shows an explicit empty state instead of a blank field", () => {
    expect(displayFieldValue(null)).toBe(EMPTY_FIELD_LABEL);
    expect(displayFieldValue("   ")).toBe(EMPTY_FIELD_LABEL);
    expect(displayFieldValue(" Dakar ")).toBe("Dakar");
  });
});
