import { afterEach, describe, expect, it } from "vitest";
import type { AuditLogEntry } from "@/services/audit.service";
import type { Actor } from "@/services/identity.service";
import {
  configureResellerApplicationDependencies,
  listResellerApplications,
  parseResellerApplicationFilters,
  parseResellerApplicationInput,
  resetResellerApplicationDependencies,
  reviewResellerApplication,
  submitResellerApplication,
  toResellerApplicationView,
  type ResellerApplicationCreateData,
  type ResellerApplicationFilters,
  type ResellerApplicationRepository,
  type ResellerApplicationReviewValues,
  type ResellerApplicationRow,
} from "@/services/reseller-application.service";
import { customerActor, staffActor, visitorActor } from "./support/actors";

const admin: Actor = staffActor();
const commercial: Actor = staffActor(["reseller.view"]);
const approver: Actor = staffActor(["reseller.view", "reseller.approve"]);
const rejecter: Actor = staffActor(["reseller.view", "reseller.reject"]);

function appRow(overrides: Partial<ResellerApplicationRow> = {}): ResellerApplicationRow {
  return {
    id: "app-1",
    customerId: "customer-1",
    companyName: "Diaba SARL",
    businessType: null,
    estimatedVolume: null,
    status: "PENDING",
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function appRepository(initial: ResellerApplicationRow[] = [appRow()]) {
  const rows = [...initial];
  const created: ResellerApplicationCreateData[] = [];
  const updateCalls: { id: string; values: ResellerApplicationReviewValues }[] = [];
  const approvedCustomers: string[] = [];
  const listedFilters: ResellerApplicationFilters[] = [];
  const transactions: number[] = [];

  const repo: ResellerApplicationRepository = {
    async findOpenByCustomer(customerId) {
      return (
        rows.find(
          (row) => row.customerId === customerId && (row.status === "PENDING" || row.status === "UNDER_REVIEW"),
        ) ?? null
      );
    },
    async create(data) {
      created.push(data);
      const row = appRow({
        id: `app-${created.length}`,
        customerId: data.customerId,
        companyName: data.companyName,
        businessType: data.businessType,
        estimatedVolume: data.estimatedVolume,
        status: data.status,
      });
      rows.push(row);
      return { ...row };
    },
    async list(filters) {
      listedFilters.push(filters);
      return rows.map((row) => ({ ...row }));
    },
    async findById(id) {
      const row = rows.find((candidate) => candidate.id === id);
      return row ? { ...row } : null;
    },
    async updateReview(id, values) {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) throw new Error("missing application");
      row.status = values.status;
      row.reviewedBy = values.reviewedBy;
      row.reviewedAt = values.reviewedAt;
      row.rejectionReason = values.rejectionReason;
      updateCalls.push({ id, values });
      return { ...row };
    },
    async approveResellerCustomer(customerId) {
      approvedCustomers.push(customerId);
    },
    async transaction(fn) {
      transactions.push(transactions.length + 1);
      return fn(repo);
    },
  };

  return { repo, rows, created, updateCalls, approvedCustomers, listedFilters, transactions };
}

function setup(initial: ResellerApplicationRow[] = [appRow()]) {
  const repository = appRepository(initial);
  const audits: AuditLogEntry[] = [];
  const audit = async (entry: AuditLogEntry) => {
    audits.push(entry);
  };
  configureResellerApplicationDependencies({ repository: repository.repo, audit });
  return { repository, audits };
}

afterEach(() => resetResellerApplicationDependencies());

describe("submitResellerApplication", () => {
  it("requires an authenticated customer", async () => {
    setup();
    await expect(submitResellerApplication(visitorActor, { companyName: "X" })).rejects.toThrowError(/authent/i);
    await expect(submitResellerApplication(admin, { companyName: "X" })).rejects.toThrowError(/refus/i);
  });

  it("derives customerId from the server-resolved actor and always starts PENDING", async () => {
    const { repository } = setup([]);
    const result = await submitResellerApplication(customerActor, {
      companyName: "Diaba SARL",
      businessType: "Import",
      estimatedVolume: "10/mois",
    });

    expect(result.id).toBe("app-1");
    expect(repository.created[0]).toEqual({
      customerId: "customer-1",
      companyName: "Diaba SARL",
      businessType: "Import",
      estimatedVolume: "10/mois",
      status: "PENDING",
    });
  });

  it("refuses a second open application (invariant « une demande ouverte maximum »)", async () => {
    const { repository } = setup([appRow({ status: "UNDER_REVIEW" })]);
    let code = "";
    try {
      await submitResellerApplication(customerActor, { companyName: "Diaba SARL" });
    } catch (error) {
      code = (error as { code: string }).code;
    }
    expect(code).toBe("CONFLICT");
    expect(repository.created).toEqual([]);
  });

  it("accepts a new application once the previous one is closed", async () => {
    const { repository } = setup([appRow({ status: "REJECTED" })]);
    await submitResellerApplication(customerActor, { companyName: "Diaba SARL" });
    expect(repository.created).toHaveLength(1);
  });

  it("rejects unknown fields and a missing company name", () => {
    expect(() => parseResellerApplicationInput({ companyName: "X", customerId: "c2" })).toThrowError(/invalide/i);
    expect(() => parseResellerApplicationInput({ companyName: "" })).toThrowError(/invalide/i);
  });
});

describe("listResellerApplications", () => {
  it("requires reseller.view and applies validated filters", async () => {
    const { repository } = setup();

    await expect(listResellerApplications(customerActor)).rejects.toThrowError(/refus/i);
    await expect(listResellerApplications(staffActor(["vehicle.view"]))).rejects.toThrowError(/refus/i);

    const views = await listResellerApplications(commercial, { status: "PENDING" });
    expect(views).toHaveLength(1);
    expect(repository.listedFilters).toEqual([{ status: "PENDING" }]);
  });

  it("rejects unknown filter fields", () => {
    expect(() => parseResellerApplicationFilters({ unknown: true } as never)).toThrowError(/invalides/i);
  });
});

describe("reviewResellerApplication — permissions and states", () => {
  it("requires the permission matching the action", async () => {
    setup([appRow({ status: "PENDING" })]);
    await expect(reviewResellerApplication(commercial, "app-1", "APPROVE")).rejects.toThrowError(/refus/i);
    await expect(reviewResellerApplication(commercial, "app-1", "REJECT")).rejects.toThrowError(/refus/i);

    setup([appRow({ status: "UNDER_REVIEW" })]);
    await expect(reviewResellerApplication(approver, "app-1", "REJECT")).rejects.toThrowError(/refus/i);
    await expect(reviewResellerApplication(rejecter, "app-1", "APPROVE")).rejects.toThrowError(/refus/i);
  });

  it("allows a commercial holding reseller.view to take charge and cancel", async () => {
    const { repository } = setup([appRow({ status: "PENDING" })]);
    const view = await reviewResellerApplication(commercial, "app-1", "START_REVIEW");
    expect(view.status).toBe("UNDER_REVIEW");
    expect(repository.updateCalls[0].values.reviewedBy).toBe("staff-1");
  });

  it("refuses an unlisted transition with VALIDATION and writes nothing", async () => {
    const { repository } = setup([appRow({ status: "PENDING" })]);
    let code = "";
    try {
      await reviewResellerApplication(approver, "app-1", "APPROVE");
    } catch (error) {
      code = (error as { code: string }).code;
    }
    expect(code).toBe("VALIDATION");
    expect(repository.updateCalls).toEqual([]);
    expect(repository.transactions).toEqual([]);
  });

  it("returns a neutral NOT_FOUND for an unknown application", async () => {
    setup();
    await expect(reviewResellerApplication(admin, "missing", "START_REVIEW")).rejects.toThrowError(/introuvable/i);
  });
});

describe("reviewResellerApplication — approval effect and audit", () => {
  it("approves: updates the application and the customer profile in one transaction", async () => {
    const { repository, audits } = setup([appRow({ status: "UNDER_REVIEW" })]);
    const view = await reviewResellerApplication(admin, "app-1", "APPROVE");

    expect(view.status).toBe("APPROVED");
    expect(repository.approvedCustomers).toEqual(["customer-1"]);
    expect(repository.transactions).toHaveLength(1);
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("reseller.status.change");
    expect(audits[0].entityType).toBe("ResellerApplication");
    expect(audits[0].entityId).toBe("app-1");
    expect(audits[0].reason).toBeTruthy();
    expect(audits[0].newValues).toMatchObject({ status: "APPROVED" });
  });

  it("rejects: stores the rejection reason and uses it as the audit motif", async () => {
    const { repository, audits } = setup([appRow({ status: "UNDER_REVIEW" })]);
    const view = await reviewResellerApplication(rejecter, "app-1", "REJECT", { rejectionReason: "Dossier incomplet." });

    expect(view.status).toBe("REJECTED");
    expect(view.rejectionReason).toBe("Dossier incomplet.");
    expect(repository.approvedCustomers).toEqual([]);
    expect(audits[0].reason).toBe("Dossier incomplet.");
  });

  it("cancels an open application and audits the transition", async () => {
    const { repository, audits } = setup([appRow({ status: "PENDING" })]);
    const view = await reviewResellerApplication(admin, "app-1", "CANCEL");

    expect(view.status).toBe("CANCELLED");
    expect(repository.approvedCustomers).toEqual([]);
    expect(audits).toHaveLength(1);
    expect(audits[0].reason).toContain("PENDING");
  });

  it("refuses a transition from a terminal state", async () => {
    setup([appRow({ status: "APPROVED" })]);
    await expect(reviewResellerApplication(admin, "app-1", "CANCEL")).rejects.toThrowError(/impossible/i);
  });

  it("refuses an unknown review action", async () => {
    setup();
    await expect(
      reviewResellerApplication(admin, "app-1", "DELETE" as never),
    ).rejects.toThrowError(/inconnue/i);
  });
});

describe("toResellerApplicationView", () => {
  it("projects every field of the row", () => {
    const row = appRow({ status: "UNDER_REVIEW", reviewedBy: "staff-1", reviewedAt: new Date() });
    expect(toResellerApplicationView(row)).toEqual(row);
  });
});
