import { afterEach, describe, expect, it } from "vitest";
import {
  configureStaffCustomerDependencies,
  listCustomers,
  parseCustomerFilters,
  parseCustomerId,
  parseCustomerUpdate,
  parseResellerStatus,
  readCustomer,
  resetStaffCustomerDependencies,
  setResellerStatus,
  StaffCustomerValidationError,
  toCustomerDetail,
  toCustomerListItem,
  updateCustomer,
  type CustomerFilters,
  type CustomerRow,
  type CustomerUpdateData,
  type StaffCustomerRepository,
} from "@/services/staff-customer.service";
import type { AuditLogEntry } from "@/services/audit.service";
import type { ResellerStatus } from "@/services/pricing.service";
import { customerActor, staffActor, visitorActor } from "@/tests/unit/support/actors";

const viewOnlyStaff = staffActor(["customer.view"]);
const editorStaff = staffActor(["customer.view", "customer.edit"]);

function row(overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    id: "c1",
    firstName: "Awa",
    lastName: "Diop",
    phone: "+221****4567",
    whatsapp: null,
    city: "Dakar",
    country: "SN",
    companyName: null,
    segment: "INDIVIDUAL",
    pricingProfile: "STANDARD",
    resellerStatus: "NOT_APPLICABLE",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-02T00:00:00Z"),
    ...overrides,
  };
}

function repository(rows: CustomerRow[] = [row()]): StaffCustomerRepository & {
  calls: {
    list: CustomerFilters[];
    read: string[];
    update: { customerId: string; data: CustomerUpdateData }[];
    reseller: { customerId: string; status: ResellerStatus }[];
  };
} {
  const calls = {
    list: [] as CustomerFilters[],
    read: [] as string[],
    update: [] as { customerId: string; data: CustomerUpdateData }[],
    reseller: [] as { customerId: string; status: ResellerStatus }[],
  };

  return {
    calls,
    async listCustomers(filters) {
      calls.list.push(filters);
      return rows;
    },
    async readCustomer(customerId) {
      calls.read.push(customerId);
      return rows.find((item) => item.id === customerId) ?? null;
    },
    async updateCustomer(customerId, data) {
      calls.update.push({ customerId, data });
      const existing = rows.find((item) => item.id === customerId);
      if (!existing) return null;

      const merged: CustomerRow = { ...existing };
      if (data.firstName !== undefined) merged.firstName = data.firstName;
      if (data.lastName !== undefined) merged.lastName = data.lastName;
      if (data.phone !== undefined) merged.phone = data.phone;
      if (data.whatsapp !== undefined) merged.whatsapp = data.whatsapp;
      if (data.city !== undefined) merged.city = data.city;
      if (data.country !== undefined) merged.country = data.country;
      if (data.segment !== undefined) merged.segment = data.segment;
      return merged;
    },
    async setResellerStatus(customerId, status) {
      calls.reseller.push({ customerId, status });
      const existing = rows.find((item) => item.id === customerId);
      return existing ? { ...existing, resellerStatus: status } : null;
    },
  };
}

function auditWriter(): { entries: AuditLogEntry[]; write: (entry: AuditLogEntry) => Promise<void> } {
  const entries: AuditLogEntry[] = [];
  return {
    entries,
    async write(entry) {
      entries.push(entry);
    },
  };
}

afterEach(() => {
  resetStaffCustomerDependencies();
});

describe("parseCustomerFilters", () => {
  it("accepts no filter at all", () => {
    expect(parseCustomerFilters(undefined)).toEqual({});
  });

  it("accepts the known filters only", () => {
    const parsed = parseCustomerFilters({ segment: "FLEET", resellerStatus: "APPROVED", search: " Dakar " });
    expect(parsed).toEqual({ segment: "FLEET", resellerStatus: "APPROVED", search: "Dakar" });
  });

  it("rejects an unknown filter instead of ignoring it", () => {
    expect(() => parseCustomerFilters({ segment: "FLEET", orderBy: "name" })).toThrowError(/orderBy/);
  });

  it("rejects an invented segment value", () => {
    expect(() => parseCustomerFilters({ segment: "VIP" })).toThrowError(StaffCustomerValidationError);
  });
});

describe("parseCustomerUpdate", () => {
  it("accepts a partial patch of the allowed fields", () => {
    expect(parseCustomerUpdate({ segment: "GARAGE" })).toEqual({ segment: "GARAGE" });
  });

  it("accepts coordinates, including explicit nulls", () => {
    expect(parseCustomerUpdate({ phone: " +221 78 000 00 00 ", city: null })).toEqual({
      phone: "+221 78 000 00 00",
      city: null,
    });
  });

  it("rejects every privilege field instead of ignoring it", () => {
    for (const field of [
      "resellerStatus",
      "pricingProfile",
      "status",
      "userType",
      "id",
      "profileId",
      "authUserId",
      "roles",
      "roleCodes",
      "createdAt",
    ]) {
      expect(() => parseCustomerUpdate({ segment: "FLEET", [field]: "RESELLER" })).toThrowError(new RegExp(field));
    }
  });

  it("rejects an unknown field", () => {
    expect(() => parseCustomerUpdate({ nickname: "x" })).toThrowError(/nickname/);
  });

  it("rejects an empty patch", () => {
    expect(() => parseCustomerUpdate({})).toThrowError(StaffCustomerValidationError);
  });

  it("never echoes the offending value in the message", () => {
    let message = "";
    try {
      parseCustomerUpdate({ firstName: "x".repeat(200) });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("firstName");
    expect(message).not.toContain("x".repeat(200));
  });
});

describe("parseCustomerId / parseResellerStatus", () => {
  it("trims a valid identifier and rejects an empty one", () => {
    expect(parseCustomerId(" c1 ")).toBe("c1");
    expect(() => parseCustomerId("   ")).toThrowError(StaffCustomerValidationError);
  });

  it("accepts only the ResellerStatus enum values", () => {
    expect(parseResellerStatus("SUSPENDED")).toBe("SUSPENDED");
    expect(() => parseResellerStatus("UNDER_REVIEW")).toThrowError(StaffCustomerValidationError);
    expect(() => parseResellerStatus("APPROVED_BY_ADMIN")).toThrowError(StaffCustomerValidationError);
  });
});

describe("listCustomers", () => {
  it("requires customer.view and returns no data without it", async () => {
    const repo = repository();
    configureStaffCustomerDependencies({ repository: repo });

    await expect(listCustomers(staffActor(["customer.edit"]))).rejects.toThrowError(/refus/i);
    await expect(listCustomers(customerActor)).rejects.toThrowError(/refus/i);
    await expect(listCustomers(visitorActor)).rejects.toThrowError(/authent/i);
    expect(repo.calls.list).toHaveLength(0);
  });

  it("passes the validated filters to the repository", async () => {
    const repo = repository();
    configureStaffCustomerDependencies({ repository: repo });

    await listCustomers(viewOnlyStaff, { segment: "FLEET", search: " Dakar " });

    expect(repo.calls.list).toEqual([{ segment: "FLEET", search: "Dakar" }]);
  });

  it("returns only the projected columns of the list", async () => {
    const repo = repository();
    configureStaffCustomerDependencies({ repository: repo });

    const [item] = await listCustomers(viewOnlyStaff);

    expect(Object.keys(item).sort()).toEqual([
      "city",
      "country",
      "createdAt",
      "firstName",
      "id",
      "lastName",
      "phone",
      "pricingProfile",
      "resellerStatus",
      "segment",
      "whatsapp",
    ]);
    expect(item).not.toHaveProperty("companyName");
    expect(item).not.toHaveProperty("updatedAt");
  });
});

describe("readCustomer", () => {
  it("requires customer.view", async () => {
    const repo = repository();
    configureStaffCustomerDependencies({ repository: repo });

    await expect(readCustomer(staffActor(["customer.edit"]), "c1")).rejects.toThrowError(/refus/i);
    expect(repo.calls.read).toHaveLength(0);
  });

  it("returns the detailed projection of the requested customer", async () => {
    const repo = repository([row({ id: "c9", companyName: "Diaba SARL" })]);
    configureStaffCustomerDependencies({ repository: repo });

    const detail = await readCustomer(viewOnlyStaff, "c9");

    expect(repo.calls.read).toEqual(["c9"]);
    expect(detail.id).toBe("c9");
    expect(detail.companyName).toBe("Diaba SARL");
    expect(Object.keys(detail).sort()).toEqual([
      "city",
      "companyName",
      "country",
      "createdAt",
      "firstName",
      "id",
      "lastName",
      "phone",
      "pricingProfile",
      "resellerStatus",
      "segment",
      "updatedAt",
      "whatsapp",
    ]);
  });

  it("returns a neutral NOT_FOUND for an unknown customer", async () => {
    const repo = repository();
    configureStaffCustomerDependencies({ repository: repo });

    await expect(readCustomer(viewOnlyStaff, "unknown")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("updateCustomer", () => {
  it("requires customer.edit and touches no data without it", async () => {
    const repo = repository();
    configureStaffCustomerDependencies({ repository: repo });

    await expect(updateCustomer(viewOnlyStaff, "c1", { segment: "FLEET" })).rejects.toThrowError(/refus/i);
    expect(repo.calls.update).toHaveLength(0);
  });

  it("applies the patch and returns the updated detail", async () => {
    const repo = repository();
    configureStaffCustomerDependencies({ repository: repo });

    const detail = await updateCustomer(editorStaff, "c1", { segment: "FLEET", city: "Saint-Louis" });

    expect(repo.calls.update).toEqual([{ customerId: "c1", data: { segment: "FLEET", city: "Saint-Louis" } }]);
    expect(detail.segment).toBe("FLEET");
    expect(detail.city).toBe("Saint-Louis");
  });

  it("rejects a privilege field before any data access", async () => {
    const repo = repository();
    configureStaffCustomerDependencies({ repository: repo });

    await expect(updateCustomer(editorStaff, "c1", { resellerStatus: "APPROVED" })).rejects.toThrowError(
      /resellerStatus/,
    );
    expect(repo.calls.update).toHaveLength(0);
  });

  it("returns a neutral NOT_FOUND for an unknown customer", async () => {
    const repo = repository();
    configureStaffCustomerDependencies({ repository: repo });

    await expect(updateCustomer(editorStaff, "unknown", { segment: "FLEET" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("setResellerStatus", () => {
  it("requires customer.edit and touches no data without it", async () => {
    const repo = repository();
    configureStaffCustomerDependencies({ repository: repo });

    await expect(setResellerStatus(viewOnlyStaff, "c1", "SUSPENDED")).rejects.toThrowError(/refus/i);
    expect(repo.calls.read).toHaveLength(0);
    expect(repo.calls.reseller).toHaveLength(0);
  });

  it("writes only the reseller status and audits the change", async () => {
    const repo = repository([row({ pricingProfile: "RESELLER", resellerStatus: "APPROVED" })]);
    const audit = auditWriter();
    configureStaffCustomerDependencies({ repository: repo, audit: audit.write });

    const detail = await setResellerStatus(editorStaff, "c1", "SUSPENDED");

    expect(repo.calls.reseller).toEqual([{ customerId: "c1", status: "SUSPENDED" }]);
    // Le profil tarifaire est conservé : seule la désactivation du tarif est demandée ici.
    expect(detail.pricingProfile).toBe("RESELLER");
    expect(detail.resellerStatus).toBe("SUSPENDED");
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0].action).toBe("reseller.status.change");
    expect(audit.entries[0].actorProfileId).toBe(editorStaff.profileId);
    expect(audit.entries[0].entityId).toBe("c1");
    expect(audit.entries[0].oldValues).toEqual({ resellerStatus: "APPROVED" });
    expect(audit.entries[0].newValues).toEqual({ resellerStatus: "SUSPENDED" });
  });

  it("is a no-op (no write, no audit) when the status is unchanged", async () => {
    const repo = repository([row({ resellerStatus: "SUSPENDED" })]);
    const audit = auditWriter();
    configureStaffCustomerDependencies({ repository: repo, audit: audit.write });

    const detail = await setResellerStatus(editorStaff, "c1", "SUSPENDED");

    expect(detail.resellerStatus).toBe("SUSPENDED");
    expect(repo.calls.reseller).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it("rejects a status outside the ResellerStatus enum", async () => {
    const repo = repository();
    configureStaffCustomerDependencies({ repository: repo });

    await expect(setResellerStatus(editorStaff, "c1", "UNDER_REVIEW" as ResellerStatus)).rejects.toThrowError(
      StaffCustomerValidationError,
    );
    expect(repo.calls.read).toHaveLength(0);
  });

  it("returns a neutral NOT_FOUND for an unknown customer", async () => {
    const repo = repository();
    const audit = auditWriter();
    configureStaffCustomerDependencies({ repository: repo, audit: audit.write });

    await expect(setResellerStatus(editorStaff, "unknown", "SUSPENDED")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(audit.entries).toHaveLength(0);
  });
});

describe("projections", () => {
  it("toCustomerListItem never exposes the company name nor timestamps other than createdAt", () => {
    const item = toCustomerListItem(row({ companyName: "Secret SARL" }));
    expect(item).not.toHaveProperty("companyName");
    expect(item).not.toHaveProperty("updatedAt");
  });

  it("toCustomerDetail exposes the company name", () => {
    expect(toCustomerDetail(row({ companyName: "Diaba SARL" })).companyName).toBe("Diaba SARL");
  });
});