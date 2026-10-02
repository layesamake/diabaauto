import { describe, expect, it } from "vitest";
import {
  configureCustomRequestDependencies,
  CustomRequestValidationError,
  isCustomRequestStatus,
  listCustomRequests,
  listOwnCustomRequests,
  parseCustomRequestInput,
  resetCustomRequestDependencies,
  submitCustomRequest,
  toCustomRequestView,
  updateCustomRequestStatus,
  type CustomRequestRepository,
  type CustomRequestRow,
} from "@/services/custom-request.service";
import type { Actor } from "@/services/identity.service";

const visitor: Actor = { kind: "visitor" };
const suspended: Actor = { kind: "suspended", profileId: "p2", userType: "CUSTOMER" };
const staff: Actor = {
  kind: "staff",
  profileId: "p9",
  staffId: "s9",
  status: "ACTIVE",
  active: true,
  roles: [{ code: "ADMIN", permissions: [] }],
  roleCodes: ["ADMIN"],
  permissions: [],
};
const crmStaff: Actor = {
  kind: "staff",
  profileId: "p8",
  staffId: "s8",
  status: "ACTIVE",
  active: true,
  roles: [{ code: "COMMERCIAL", permissions: ["lead.view", "lead.update"] }],
  roleCodes: ["COMMERCIAL"],
  permissions: ["lead.view", "lead.update"],
};
const customer: Actor = {
  kind: "customer",
  profileId: "p1",
  customerId: "c1",
  status: "ACTIVE",
  resellerStatus: "NOT_APPLICABLE",
};
const otherCustomer: Actor = {
  kind: "customer",
  profileId: "p3",
  customerId: "c3",
  status: "ACTIVE",
  resellerStatus: "NOT_APPLICABLE",
};

function row(overrides: Partial<CustomRequestRow> = {}): CustomRequestRow {
  return {
    id: "req-1",
    customerId: "c1",
    contactName: null,
    contactPhone: null,
    criteriaJson: { brand: "Toyota" },
    budgetMin: null,
    budgetMax: null,
    status: "RECEIVED",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

function repository(): CustomRequestRepository & {
  created: Parameters<CustomRequestRepository["create"]>[0][];
  listedFor: string[];
  listedFilters: Parameters<CustomRequestRepository["list"]>[0][];
  updated: { id: string; status: string }[];
} {
  const created: Parameters<CustomRequestRepository["create"]>[0][] = [];
  const listedFor: string[] = [];
  const listedFilters: Parameters<CustomRequestRepository["list"]>[0][] = [];
  const updated: { id: string; status: string }[] = [];

  return {
    created,
    listedFor,
    listedFilters,
    updated,
    async create(data) {
      created.push(data);
      return row({
        customerId: data.customerId,
        contactName: data.contactName,
        contactPhone: data.contactPhone,
        criteriaJson: data.criteriaJson,
        budgetMin: data.budgetMin,
        budgetMax: data.budgetMax,
      });
    },
    async listByCustomer(customerId) {
      listedFor.push(customerId);
      return [row({ customerId })];
    },
    async list(filters) {
      listedFilters.push(filters);
      return [row({ status: filters?.status ?? "RECEIVED" })];
    },
    async findById(id) {
      return id === "missing" ? null : row({ id });
    },
    async updateStatus(id, status) {
      if (id === "missing") return null;
      updated.push({ id, status });
      return row({ id, status });
    },
  };
}

describe("parseCustomRequestInput", () => {
  it("accepts a minimal criteria payload for a visitor with contact", () => {
    const parsed = parseCustomRequestInput(
      { criteria: { brand: "Toyota" }, contactName: "Awa Diop", contactPhone: "+221771234567" },
      visitor,
    );

    expect(parsed.criteria).toEqual({ brand: "Toyota" });
    expect(parsed.contactName).toBe("Awa Diop");
    expect(parsed.contactPhone).toBe("+221771234567");
  });

  it("rejects an empty criteria object", () => {
    expect(() =>
      parseCustomRequestInput({ criteria: {}, contactName: "A", contactPhone: "+221770000000" }, visitor),
    ).toThrowError(CustomRequestValidationError);
  });

  it("rejects unknown fields instead of ignoring them", () => {
    expect(() =>
      parseCustomRequestInput(
        { criteria: { brand: "Toyota" }, contactName: "A", contactPhone: "+221770000000", customerId: "c2" },
        visitor,
      ),
    ).toThrowError(/customerId/);
  });

  it("requires contactName and contactPhone for a visitor", () => {
    let fields: string[] = [];
    try {
      parseCustomRequestInput({ criteria: { brand: "Toyota" } }, visitor);
    } catch (error) {
      fields = (error as CustomRequestValidationError).fields;
    }

    expect(fields).toEqual(["contactName", "contactPhone"]);
  });

  it("requires contact for a suspended account exactly like a visitor", () => {
    expect(() => parseCustomRequestInput({ criteria: { brand: "Toyota" } }, suspended)).toThrowError(
      CustomRequestValidationError,
    );
  });

  it("requires contact for a staff session (not a connected customer)", () => {
    expect(() => parseCustomRequestInput({ criteria: { brand: "Toyota" } }, staff)).toThrowError(
      CustomRequestValidationError,
    );
  });

  it("ignores contact fields sent by an already-identified customer", () => {
    const parsed = parseCustomRequestInput(
      { criteria: { brand: "Toyota" }, contactName: "Imposteur", contactPhone: "+221700000000" },
      customer,
    );

    expect(parsed.contactName).toBeNull();
    expect(parsed.contactPhone).toBeNull();
  });

  it("allows a connected customer to submit without any contact field", () => {
    const parsed = parseCustomRequestInput({ criteria: { model: "Corolla" } }, customer);
    expect(parsed.contactName).toBeNull();
    expect(parsed.contactPhone).toBeNull();
  });

  it("rejects budgetMin greater than budgetMax", () => {
    expect(() =>
      parseCustomRequestInput({ criteria: { brand: "Toyota" }, budgetMin: "5000000", budgetMax: "1000000" }, customer),
    ).toThrowError(CustomRequestValidationError);
  });

  it("accepts budgetMin equal to budgetMax", () => {
    const parsed = parseCustomRequestInput(
      { criteria: { brand: "Toyota" }, budgetMin: "1000000", budgetMax: "1000000" },
      customer,
    );
    expect(parsed.budgetMin).toBe("1000000");
    expect(parsed.budgetMax).toBe("1000000");
  });

  it("rejects a malformed amount", () => {
    expect(() =>
      parseCustomRequestInput({ criteria: { brand: "Toyota" }, budgetMin: "abc" }, customer),
    ).toThrowError(CustomRequestValidationError);
  });

  it("never echoes the offending value in the error message", () => {
    let message = "";
    try {
      parseCustomRequestInput({ criteria: { brand: "x".repeat(200) } }, customer);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).not.toContain("x".repeat(200));
  });
});

describe("submitCustomRequest", () => {
  it("derives customerId from the server-resolved actor, never from the input", async () => {
    const repo = repository();
    configureCustomRequestDependencies({ repository: repo });

    await submitCustomRequest(customer, { criteria: { brand: "Toyota" } });

    expect(repo.created).toHaveLength(1);
    expect(repo.created[0].customerId).toBe("c1");
    resetCustomRequestDependencies();
  });

  it("stores no customerId for a visitor", async () => {
    const repo = repository();
    configureCustomRequestDependencies({ repository: repo });

    await submitCustomRequest(visitor, {
      criteria: { brand: "Toyota" },
      contactName: "Awa Diop",
      contactPhone: "+221771234567",
    });

    expect(repo.created[0].customerId).toBeNull();
    expect(repo.created[0].contactName).toBe("Awa Diop");
    resetCustomRequestDependencies();
  });

  it("never persists a customerId for a suspended account (invariant transversal)", async () => {
    const repo = repository();
    configureCustomRequestDependencies({ repository: repo });

    await submitCustomRequest(suspended, {
      criteria: { brand: "Toyota" },
      contactName: "Awa Diop",
      contactPhone: "+221771234567",
    });

    expect(repo.created[0].customerId).toBeNull();
    resetCustomRequestDependencies();
  });

  it("never persists a contact for a connected customer", async () => {
    const repo = repository();
    configureCustomRequestDependencies({ repository: repo });

    await submitCustomRequest(customer, {
      criteria: { brand: "Toyota" },
      contactName: "Imposteur",
      contactPhone: "+221700000000",
    });

    expect(repo.created[0].contactName).toBeNull();
    expect(repo.created[0].contactPhone).toBeNull();
    resetCustomRequestDependencies();
  });
});

describe("listOwnCustomRequests", () => {
  it("requires an authenticated customer", async () => {
    const repo = repository();
    configureCustomRequestDependencies({ repository: repo });

    await expect(listOwnCustomRequests(visitor)).rejects.toThrowError(/authent/i);
    await expect(listOwnCustomRequests(staff)).rejects.toThrowError(/refus/i);
    resetCustomRequestDependencies();
  });

  it("only ever lists the caller's own requests", async () => {
    const repo = repository();
    configureCustomRequestDependencies({ repository: repo });

    await listOwnCustomRequests(otherCustomer);

    expect(repo.listedFor).toEqual(["c3"]);
    resetCustomRequestDependencies();
  });

  it("never exposes contact fields or customerId in the projection", async () => {
    const repo = repository();
    configureCustomRequestDependencies({ repository: repo });

    const [view] = await listOwnCustomRequests(customer);

    expect(Object.keys(view).sort()).toEqual(["budgetMax", "budgetMin", "createdAt", "criteria", "id", "status"]);
    resetCustomRequestDependencies();
  });
});

describe("toCustomRequestView", () => {
  it("projects only the known criteria keys", () => {
    const view = toCustomRequestView(row({ criteriaJson: { brand: "Toyota", unknown: "x" } }));
    expect(view.criteria).toEqual({ brand: "Toyota" });
  });

  it("tolerates an empty criteria object", () => {
    const view = toCustomRequestView(row({ criteriaJson: {} }));
    expect(view.criteria).toEqual({});
  });
});

describe("isCustomRequestStatus", () => {
  it("accepts every RequestStatus value of the corpus", () => {
    for (const status of ["RECEIVED", "QUALIFIED", "SEARCHING", "PROPOSED", "CLOSED", "ABANDONED"]) {
      expect(isCustomRequestStatus(status)).toBe(true);
    }
  });

  it("rejects anything outside the corpus enum", () => {
    expect(isCustomRequestStatus("APPROVED")).toBe(false);
    expect(isCustomRequestStatus(42)).toBe(false);
    expect(isCustomRequestStatus(null)).toBe(false);
  });
});

describe("listCustomRequests (personnel)", () => {
  it("requires the lead.view permission", async () => {
    const repo = repository();
    configureCustomRequestDependencies({ repository: repo });

    await expect(listCustomRequests(visitor)).rejects.toThrowError();
    await expect(listCustomRequests(customer)).rejects.toThrowError();
    await expect(listCustomRequests(staff)).rejects.toThrowError(/refus/i);
    resetCustomRequestDependencies();
  });

  it("passes the status filter through and projects the rows", async () => {
    const repo = repository();
    configureCustomRequestDependencies({ repository: repo });

    const views = await listCustomRequests(crmStaff, { status: "SEARCHING" });

    expect(repo.listedFilters).toEqual([{ status: "SEARCHING" }]);
    expect(views).toHaveLength(1);
    expect(Object.keys(views[0]).sort()).toEqual(["budgetMax", "budgetMin", "createdAt", "criteria", "id", "status"]);
    resetCustomRequestDependencies();
  });

  it("rejects an unknown status filter", async () => {
    const repo = repository();
    configureCustomRequestDependencies({ repository: repo });

    await expect(
      listCustomRequests(crmStaff, { status: "NOPE" as never }),
    ).rejects.toThrowError(CustomRequestValidationError);
    resetCustomRequestDependencies();
  });
});

describe("updateCustomRequestStatus (personnel)", () => {
  it("requires the lead.update permission", async () => {
    const repo = repository();
    configureCustomRequestDependencies({ repository: repo });

    await expect(updateCustomRequestStatus(customer, "req-1", "QUALIFIED")).rejects.toThrowError();
    await expect(updateCustomRequestStatus(staff, "req-1", "QUALIFIED")).rejects.toThrowError(/refus/i);
    resetCustomRequestDependencies();
  });

  it("updates the status through the repository", async () => {
    const repo = repository();
    configureCustomRequestDependencies({ repository: repo });

    const view = await updateCustomRequestStatus(crmStaff, "req-1", "PROPOSED");

    expect(repo.updated).toEqual([{ id: "req-1", status: "PROPOSED" }]);
    expect(view.status).toBe("PROPOSED");
    resetCustomRequestDependencies();
  });

  it("rejects an unknown status value", async () => {
    const repo = repository();
    configureCustomRequestDependencies({ repository: repo });

    await expect(
      updateCustomRequestStatus(crmStaff, "req-1", "DONE" as never),
    ).rejects.toThrowError(CustomRequestValidationError);
    resetCustomRequestDependencies();
  });

  it("returns a neutral NOT_FOUND when the request does not exist", async () => {
    const repo = repository();
    configureCustomRequestDependencies({ repository: repo });

    await expect(updateCustomRequestStatus(crmStaff, "missing", "CLOSED")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    resetCustomRequestDependencies();
  });
});
