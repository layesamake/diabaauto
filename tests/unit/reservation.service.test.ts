import { afterEach, describe, expect, it } from "vitest";
import type { AuditLogEntry } from "@/services/audit.service";
import type { Actor } from "@/services/identity.service";
import {
  cancelReservation,
  confirmReservation,
  configureReservationDependencies,
  createReservation,
  expireReservation,
  listOwnReservations,
  listReservations,
  parseDepositReport,
  parseReservationCreate,
  parseReservationFilters,
  readReservation,
  rejectDeposit,
  reportDeposit,
  resetReservationDependencies,
  toReservationView,
  verifyDeposit,
  type ReservationCreateData,
  type ReservationDepositValues,
  type ReservationFilters,
  type ReservationRepository,
  type ReservationRow,
  type ReservationStatusValues,
} from "@/services/reservation.service";
import type { VehicleCommercialStatus } from "@/services/transitions.service";
import { customerActor, staffActor, visitorActor } from "./support/actors";

const admin: Actor = staffActor();
const viewer: Actor = staffActor(["order.view"]);
const reserver: Actor = staffActor(["vehicle.reserve"]);

const YEAR = new Date().getUTCFullYear();

function row(overrides: Partial<ReservationRow> = {}): ReservationRow {
  return {
    id: "res-1",
    reference: `RES-${YEAR}-000001`,
    vehicleId: "vehicle-1",
    customerId: "customer-1",
    leadId: null,
    status: "PENDING",
    expiresAt: null,
    agreedPrice: null,
    depositRequired: false,
    depositAmount: null,
    depositCurrency: null,
    depositStatus: "NOT_REQUIRED",
    externalDepositReference: null,
    confirmedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function reservationRepository(initial: ReservationRow[] = [], vehicles: Record<string, VehicleCommercialStatus> = {}) {
  const rows = [...initial];
  const vehicleStatuses = new Map<string, VehicleCommercialStatus>(Object.entries(vehicles));
  const created: ReservationCreateData[] = [];
  const statusCalls: { id: string; values: ReservationStatusValues }[] = [];
  const depositCalls: { id: string; values: ReservationDepositValues }[] = [];
  const vehicleWrites: { vehicleId: string; status: VehicleCommercialStatus }[] = [];
  const listedFilters: ReservationFilters[] = [];
  const listedCustomers: string[] = [];
  const transactions: number[] = [];

  const repo: ReservationRepository = {
    async nextReferenceSequence(year) {
      let max = 0;
      for (const candidate of rows) {
        const prefix = `RES-${year}-`;
        if (!candidate.reference.startsWith(prefix)) continue;
        const suffix = Number.parseInt(candidate.reference.slice(prefix.length), 10);
        if (Number.isInteger(suffix) && suffix > max) max = suffix;
      }
      return max + 1;
    },
    async findActiveByVehicle(vehicleId) {
      return (
        rows.find(
          (candidate) =>
            candidate.vehicleId === vehicleId &&
            (candidate.status === "PENDING" || candidate.status === "CONFIRMED"),
        ) ?? null
      );
    },
    async create(data) {
      created.push(data);
      const createdRow = row({ ...data, id: `res-${rows.length + 1}` });
      rows.push(createdRow);
      return { ...createdRow };
    },
    async findById(id) {
      const found = rows.find((candidate) => candidate.id === id);
      return found ? { ...found } : null;
    },
    async list(filters) {
      listedFilters.push(filters);
      return rows.map((candidate) => ({ ...candidate }));
    },
    async listByCustomer(customerId) {
      listedCustomers.push(customerId);
      return rows
        .filter((candidate) => candidate.customerId === customerId)
        .map((candidate) => ({ ...candidate }));
    },
    async updateStatus(id, values) {
      const found = rows.find((candidate) => candidate.id === id);
      if (!found) return null;
      found.status = values.status;
      if (values.confirmedBy !== undefined) found.confirmedBy = values.confirmedBy;
      statusCalls.push({ id, values });
      return { ...found };
    },
    async updateDeposit(id, values) {
      const found = rows.find((candidate) => candidate.id === id);
      if (!found) return null;
      found.depositStatus = values.depositStatus;
      if (values.externalDepositReference !== undefined) {
        found.externalDepositReference = values.externalDepositReference;
      }
      if (values.depositAmount !== undefined) found.depositAmount = values.depositAmount;
      if (values.depositCurrency !== undefined) found.depositCurrency = values.depositCurrency;
      depositCalls.push({ id, values });
      return { ...found };
    },
    async readVehicleCommercialStatus(vehicleId) {
      return vehicleStatuses.get(vehicleId) ?? null;
    },
    async setVehicleCommercialStatus(vehicleId, status) {
      vehicleStatuses.set(vehicleId, status);
      vehicleWrites.push({ vehicleId, status });
    },
    async transaction(fn) {
      transactions.push(transactions.length + 1);
      return fn(repo);
    },
  };

  return { repo, rows, created, statusCalls, depositCalls, vehicleWrites, listedFilters, listedCustomers, transactions, vehicleStatuses };
}

function setup(
  initial: ReservationRow[] = [row()],
  vehicles: Record<string, VehicleCommercialStatus> = { "vehicle-1": "AVAILABLE" },
) {
  const repository = reservationRepository(initial, vehicles);
  const audits: AuditLogEntry[] = [];
  const audit = async (entry: AuditLogEntry) => {
    audits.push(entry);
  };
  configureReservationDependencies({ repository: repository.repo, audit });
  return { repository, audits };
}

afterEach(() => resetReservationDependencies());

describe("createReservation", () => {
  it("requires vehicle.reserve", async () => {
    setup();
    await expect(createReservation(visitorActor, { vehicleId: "vehicle-1", customerId: "customer-1" })).rejects.toThrowError(/authent/i);
    await expect(createReservation(customerActor, { vehicleId: "vehicle-1", customerId: "customer-1" })).rejects.toThrowError(/refus/i);
    await expect(createReservation(viewer, { vehicleId: "vehicle-1", customerId: "customer-1" })).rejects.toThrowError(/refus/i);
  });

  it("creates a PENDING reservation with a server-generated RES-YYYY-NNNNNN reference", async () => {
    const { repository } = setup([], { "vehicle-1": "AVAILABLE" });
    const view = await createReservation(reserver, {
      vehicleId: "vehicle-1",
      customerId: "customer-1",
      agreedPrice: "15000000.00",
    });

    expect(view.status).toBe("PENDING");
    expect(view.reference).toBe(`RES-${YEAR}-000001`);
    expect(view.depositStatus).toBe("NOT_REQUIRED");
    expect(view.confirmed).toBe(false);
    expect(repository.created[0]).toMatchObject({
      reference: `RES-${YEAR}-000001`,
      vehicleId: "vehicle-1",
      customerId: "customer-1",
      status: "PENDING",
      agreedPrice: "15000000.00",
      depositRequired: false,
      depositStatus: "NOT_REQUIRED",
    });
    expect(repository.transactions).toHaveLength(1);
  });

  it("activates the external deposit as REQUESTED when required (no payment)", async () => {
    const { repository } = setup([], { "vehicle-1": "AVAILABLE" });
    const view = await createReservation(reserver, {
      vehicleId: "vehicle-1",
      customerId: "customer-1",
      depositRequired: true,
      depositAmount: "500000",
      depositCurrency: "xof",
    });

    expect(view.depositRequired).toBe(true);
    expect(view.depositStatus).toBe("REQUESTED");
    expect(repository.created[0].depositCurrency).toBe("XOF");
    expect(repository.vehicleWrites).toEqual([]);
  });

  it("refuses a second active reservation on the same vehicle (CONFLICT)", async () => {
    const { repository } = setup([row({ status: "CONFIRMED" })], { "vehicle-1": "RESERVED" });
    let code = "";
    try {
      await createReservation(reserver, { vehicleId: "vehicle-1", customerId: "customer-2" });
    } catch (error) {
      code = (error as { code: string }).code;
    }
    expect(code).toBe("CONFLICT");
    expect(repository.created).toEqual([]);
  });

  it("refuses a vehicle that is not AVAILABLE and an unknown vehicle", async () => {
    setup([], { "vehicle-1": "SOLD" });
    await expect(createReservation(reserver, { vehicleId: "vehicle-1", customerId: "customer-1" })).rejects.toThrowError(/disponible/i);

    setup([], {});
    await expect(createReservation(reserver, { vehicleId: "vehicle-9", customerId: "customer-1" })).rejects.toThrowError(/introuvable/i);
  });

  it("rejects unknown fields and invalid money", () => {
    expect(() => parseReservationCreate({ vehicleId: "v", customerId: "c", status: "CONFIRMED" })).toThrowError(/invalide/i);
    expect(() => parseReservationCreate({ vehicleId: "v", customerId: "c", agreedPrice: "12,5" })).toThrowError(/invalide/i);
  });
});

describe("confirmReservation", () => {
  it("requires vehicle.reserve", async () => {
    setup();
    await expect(confirmReservation(viewer, "res-1")).rejects.toThrowError(/refus/i);
  });

  it("confirms PENDING → CONFIRMED, sets the vehicle RESERVED and audits in one transaction", async () => {
    const { repository, audits } = setup();
    const view = await confirmReservation(reserver, "res-1");

    expect(view.status).toBe("CONFIRMED");
    expect(view.confirmed).toBe(true);
    expect(repository.vehicleWrites).toEqual([{ vehicleId: "vehicle-1", status: "RESERVED" }]);
    expect(repository.transactions).toHaveLength(1);
    expect(repository.statusCalls[0].values).toEqual({ status: "CONFIRMED", confirmedBy: "staff-1" });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("vehicle.reserve");
    expect(audits[0].entityType).toBe("Reservation");
    expect(audits[0].entityId).toBe("res-1");
    expect(audits[0].reason).toBeTruthy();
    expect(audits[0].newValues).toMatchObject({ status: "CONFIRMED", vehicleCommercialStatus: "RESERVED" });
  });

  it("refuses an unlisted transition (VALIDATION) and writes nothing", async () => {
    const { repository } = setup([row({ status: "EXPIRED" })]);
    let code = "";
    try {
      await confirmReservation(reserver, "res-1");
    } catch (error) {
      code = (error as { code: string }).code;
    }
    expect(code).toBe("VALIDATION");
    expect(repository.statusCalls).toEqual([]);
    expect(repository.vehicleWrites).toEqual([]);
  });

  it("returns a neutral NOT_FOUND for an unknown reservation", async () => {
    setup();
    await expect(confirmReservation(reserver, "missing")).rejects.toThrowError(/introuvable/i);
  });

  it("refuses confirmation when the vehicle is no longer available (CONFLICT)", async () => {
    setup([row({ status: "PENDING" })], { "vehicle-1": "SOLD" });
    let code = "";
    try {
      await confirmReservation(reserver, "res-1");
    } catch (error) {
      code = (error as { code: string }).code;
    }
    expect(code).toBe("CONFLICT");
  });
});

describe("cancelReservation / expireReservation", () => {
  it("cancels a PENDING reservation and leaves the vehicle untouched", async () => {
    const { repository, audits } = setup();
    const view = await cancelReservation(reserver, "res-1");
    expect(view.status).toBe("CANCELLED");
    expect(repository.vehicleWrites).toEqual([]);
    expect(audits[0].newValues).toMatchObject({ status: "CANCELLED", vehicleCommercialStatus: "AVAILABLE" });
  });

  it("cancels a CONFIRMED reservation and releases the vehicle", async () => {
    const { repository } = setup([row({ status: "CONFIRMED", confirmedBy: "staff-1" })], { "vehicle-1": "RESERVED" });
    const view = await cancelReservation(reserver, "res-1");
    expect(view.status).toBe("CANCELLED");
    expect(repository.vehicleWrites).toEqual([{ vehicleId: "vehicle-1", status: "AVAILABLE" }]);
  });

  it("expires a CONFIRMED reservation and releases the vehicle", async () => {
    const { repository, audits } = setup([row({ status: "CONFIRMED" })], { "vehicle-1": "RESERVED" });
    const view = await expireReservation(reserver, "res-1");
    expect(view.status).toBe("EXPIRED");
    expect(repository.vehicleWrites).toEqual([{ vehicleId: "vehicle-1", status: "AVAILABLE" }]);
    expect(audits[0].reason).toContain("expirée");
  });

  it("refuses to expire a PENDING reservation and to cancel a terminal one", async () => {
    setup();
    await expect(expireReservation(reserver, "res-1")).rejects.toThrowError(/impossible/i);

    setup([row({ status: "CANCELLED" })]);
    await expect(cancelReservation(reserver, "res-1")).rejects.toThrowError(/impossible/i);
  });

  it("never releases a SOLD vehicle", async () => {
    const { repository } = setup([row({ status: "CONFIRMED" })], { "vehicle-1": "SOLD" });
    const view = await expireReservation(reserver, "res-1");
    expect(view.status).toBe("EXPIRED");
    expect(repository.vehicleWrites).toEqual([]);
  });
});

describe("external deposit transitions", () => {
  it("reports a deposit from NOT_REQUIRED and stores the external reference", async () => {
    const { repository, audits } = setup([row({ depositStatus: "NOT_REQUIRED" })]);
    const view = await reportDeposit(reserver, "res-1", {
      externalDepositReference: "WAVE-2026-0001",
      depositAmount: "500000",
      depositCurrency: "XOF",
    });

    expect(view.depositStatus).toBe("REPORTED");
    expect(view.externalDepositReference).toBe("WAVE-2026-0001");
    expect(view.depositAmount).toBe("500000");
    expect(repository.depositCalls[0].values).toMatchObject({ depositStatus: "REPORTED" });
    expect(audits[0].newValues).toMatchObject({ depositStatus: "REPORTED" });
  });

  it("reports a deposit from REQUESTED, verifies it, then it is terminal", async () => {
    const { repository } = setup([row({ depositRequired: true, depositStatus: "REQUESTED" })], { "vehicle-1": "RESERVED" });
    const reported = await reportDeposit(reserver, "res-1", { externalDepositReference: "OM-42" });
    expect(reported.depositStatus).toBe("REPORTED");

    const verified = await verifyDeposit(reserver, "res-1");
    expect(verified.depositStatus).toBe("VERIFIED");

    await expect(verifyDeposit(reserver, "res-1")).rejects.toThrowError(/impossible/i);
    expect(repository.depositCalls).toHaveLength(2);
  });

  it("rejects a reported deposit and uses the provided reason as audit motif", async () => {
    const { audits } = setup([row({ depositStatus: "REPORTED" })]);
    const view = await rejectDeposit(reserver, "res-1", { reason: "Référence introuvable." });
    expect(view.depositStatus).toBe("REJECTED");
    expect(audits[0].reason).toBe("Référence introuvable.");
  });

  it("refuses an unlisted deposit transition and validates the report input", async () => {
    setup([row({ depositStatus: "VERIFIED" })]);
    await expect(reportDeposit(reserver, "res-1", { externalDepositReference: "X" })).rejects.toThrowError(/impossible/i);

    setup();
    await expect(reportDeposit(reserver, "res-1", { externalDepositReference: "" })).rejects.toThrowError(/invalide/i);
    expect(() => parseDepositReport({ externalDepositReference: "X", unknown: 1 })).toThrowError(/invalide/i);
  });

  it("requires vehicle.reserve for deposit transitions", async () => {
    setup();
    await expect(verifyDeposit(viewer, "res-1")).rejects.toThrowError(/refus/i);
  });
});

describe("reservation reads", () => {
  it("listReservations requires order.view and applies validated filters", async () => {
    const { repository } = setup();
    await expect(listReservations(reserver)).rejects.toThrowError(/refus/i);
    await expect(listReservations(customerActor)).rejects.toThrowError(/refus/i);

    const views = await listReservations(viewer, { status: "PENDING" });
    expect(views).toHaveLength(1);
    expect(repository.listedFilters).toEqual([{ status: "PENDING" }]);
  });

  it("rejects unknown filter fields", () => {
    expect(() => parseReservationFilters({ unknown: true } as never)).toThrowError(/invalide/i);
    expect(() => parseReservationFilters({ status: "ACTIVE" } as never)).toThrowError(/invalide/i);
  });

  it("readReservation requires order.view and returns a neutral NOT_FOUND", async () => {
    setup();
    await expect(readReservation(reserver, "res-1")).rejects.toThrowError(/refus/i);
    const view = await readReservation(viewer, "res-1");
    expect(view.reference).toBe(`RES-${YEAR}-000001`);
    await expect(readReservation(viewer, "missing")).rejects.toThrowError(/introuvable/i);
  });

  it("listOwnReservations requires a customer and scopes to the actor's own rows", async () => {
    const { repository } = setup([
      row({ id: "res-1", customerId: "customer-1" }),
      row({ id: "res-2", customerId: "customer-2" }),
    ]);

    await expect(listOwnReservations(admin)).rejects.toThrowError(/refus/i);
    await expect(listOwnReservations(visitorActor)).rejects.toThrowError(/authent/i);

    const views = await listOwnReservations(customerActor);
    expect(views).toHaveLength(1);
    expect(views[0].customerId).toBe("customer-1");
    expect(repository.listedCustomers).toEqual(["customer-1"]);
  });
});

describe("toReservationView", () => {
  it("projects every field and never exposes the internal confirmedBy identifier", () => {
    const source = row({ confirmedBy: "profile-staff", status: "CONFIRMED" });
    const view = toReservationView(source);
    expect(view.confirmed).toBe(true);
    expect(view).not.toHaveProperty("confirmedBy");
    expect(Object.keys(view)).not.toContain("confirmedBy");
  });
});
