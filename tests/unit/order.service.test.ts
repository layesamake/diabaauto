import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import type { AuditLogEntry } from "@/services/audit.service";
import type { Actor } from "@/services/identity.service";
import type { LeadStatus, ReservationStatus, VehicleCommercialStatus } from "@/services/transitions.service";
import {
  addLogisticsEvent,
  configureOrderDependencies,
  createOrder,
  listLogisticsEvents,
  listOrders,
  listOwnOrders,
  parseLogisticsEventInput,
  parseOrderCreate,
  parseOrderFilters,
  parseOrderStatusUpdate,
  readOrder,
  resetOrderDependencies,
  toOrderView,
  updateOrderStatus,
  type LogisticsEventCreateData,
  type LogisticsEventRow,
  type OrderCreateData,
  type OrderEventCreateData,
  type OrderEventView,
  type OrderRepository,
  type OrderRow,
  type OrderStatusUpdateData,
} from "@/services/order.service";
import { customerActor, staffActor, visitorActor } from "./support/actors";

const admin: Actor = staffActor();

setupDependencies();

// ---------------------------------------------------------------------------
// In-memory repository double — no Prisma, no database. Transactions are
// serialised through a shared promise queue so concurrent callers observe each
// other's committed effects (as the real index + transaction do).
// ---------------------------------------------------------------------------

type FakeVehicle = { id: string; commercialStatus: VehicleCommercialStatus };
type FakeLead = { id: string; status: LeadStatus };
type FakeReservation = { id: string; vehicleId: string; status: ReservationStatus };

function orderRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: "order-1",
    reference: "CMD-2026-000001",
    customerId: "customer-1",
    vehicleId: "vehicle-1",
    leadId: null,
    reservationId: null,
    salespersonId: "staff-1",
    agreedVehiclePrice: "15900000.00",
    agreedTransportPrice: null,
    currency: "XOF",
    status: "CONFIRMED",
    confirmedAt: new Date("2026-01-01T00:00:00Z"),
    estimatedArrivalAt: null,
    deliveredAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeRepository(
  seed: {
    vehicles?: FakeVehicle[];
    leads?: FakeLead[];
    orders?: OrderRow[];
    reservations?: FakeReservation[];
  } = {},
) {
  const vehicles = new Map((seed.vehicles ?? []).map((vehicle) => [vehicle.id, { ...vehicle }]));
  const leads = new Map((seed.leads ?? []).map((lead) => [lead.id, { ...lead }]));
  const reservations = new Map(
    (seed.reservations ?? []).map((reservation) => [reservation.id, { ...reservation }]),
  );
  const orders: OrderRow[] = (seed.orders ?? []).map((order) => ({ ...order }));
  const events = new Map<string, OrderEventView[]>();
  const logistics: LogisticsEventRow[] = [];

  const createdOrders: OrderCreateData[] = [];
  const statusUpdates: { id: string; values: OrderStatusUpdateData }[] = [];
  const vehicleSales: { id: string; status: string; soldAt: Date }[] = [];
  const leadChanges: { id: string; status: LeadStatus }[] = [];
  const reservationChanges: { id: string; status: ReservationStatus }[] = [];

  let transactionCount = 0;
  let queue: Promise<unknown> = Promise.resolve();

  const clone = (order: OrderRow): OrderRow => ({ ...order });

  const repo: OrderRepository = {
    async findById(id) {
      const order = orders.find((candidate) => candidate.id === id);
      return order ? clone(order) : null;
    },
    async findByReference(reference) {
      const order = orders.find((candidate) => candidate.reference === reference);
      return order ? clone(order) : null;
    },
    async findActiveByVehicle(vehicleId) {
      const order = orders.find(
        (candidate) => candidate.vehicleId === vehicleId && candidate.status !== "CANCELLED",
      );
      return order ? clone(order) : null;
    },
    async list(filters) {
      return orders
        .filter((order) => (filters.status ? order.status === filters.status : true))
        .filter((order) => (filters.customerId ? order.customerId === filters.customerId : true))
        .filter((order) => (filters.vehicleId ? order.vehicleId === filters.vehicleId : true))
        .filter((order) =>
          filters.search ? order.reference.includes(filters.search) : true,
        )
        .map(clone);
    },
    async listByCustomer(customerId, filters) {
      return orders
        .filter((order) => order.customerId === customerId)
        .filter((order) => (filters.status ? order.status === filters.status : true))
        .map(clone);
    },
    async nextReferenceSequence(year) {
      const prefix = `CMD-${year}-`;
      let max = 0;
      for (const order of orders) {
        if (!order.reference.startsWith(prefix)) continue;
        const suffix = Number.parseInt(order.reference.slice(prefix.length), 10);
        if (Number.isInteger(suffix) && suffix > max) max = suffix;
      }
      return max + 1;
    },
    async create(data) {
      // Emulates the partial unique index `orders(vehicle_id) WHERE status <> 'CANCELLED'`.
      if (orders.some((order) => order.vehicleId === data.vehicleId && order.status !== "CANCELLED")) {
        throw new AppError("CONFLICT", "Une commande active existe déjà pour ce véhicule.");
      }
      createdOrders.push(data);
      const row = orderRow({
        id: `order-${orders.length + 1}`,
        reference: data.reference,
        customerId: data.customerId,
        vehicleId: data.vehicleId,
        leadId: data.leadId,
        reservationId: data.reservationId,
        salespersonId: data.salespersonId,
        agreedVehiclePrice: data.agreedVehiclePrice,
        agreedTransportPrice: data.agreedTransportPrice,
        currency: data.currency,
        status: data.status,
        confirmedAt: data.confirmedAt,
        estimatedArrivalAt: null,
        deliveredAt: null,
      });
      orders.push(row);
      return clone(row);
    },
    async updateStatus(id, values) {
      const order = orders.find((candidate) => candidate.id === id);
      if (!order) throw new Error("missing order");
      statusUpdates.push({ id, values });
      if (values.estimatedArrivalAt !== undefined) order.estimatedArrivalAt = values.estimatedArrivalAt;
      if (values.deliveredAt !== undefined) order.deliveredAt = values.deliveredAt;
      order.status = values.status;
      order.updatedAt = new Date();
      return clone(order);
    },
    async listEvents(orderId) {
      return [...(events.get(orderId) ?? [])].map((event) => ({ ...event }));
    },
    async appendEvent(orderId, values: OrderEventCreateData) {
      const list = events.get(orderId) ?? [];
      list.push({ id: `event-${list.length + 1}`, ...values });
      events.set(orderId, list);
    },
    async findVehicle(vehicleId) {
      const vehicle = vehicles.get(vehicleId);
      return vehicle ? { ...vehicle } : null;
    },
    async setVehicleSold(vehicleId, status, soldAt) {
      const vehicle = vehicles.get(vehicleId);
      if (vehicle) vehicle.commercialStatus = status;
      vehicleSales.push({ id: vehicleId, status, soldAt });
    },
    async findLeadById(leadId) {
      const lead = leads.get(leadId);
      return lead ? { ...lead } : null;
    },
    async setLeadStatus(leadId, status) {
      const lead = leads.get(leadId);
      if (lead) lead.status = status;
      leadChanges.push({ id: leadId, status });
    },
    async findReservationById(reservationId) {
      const reservation = reservations.get(reservationId);
      return reservation ? { ...reservation } : null;
    },
    async setReservationStatus(reservationId, status) {
      const reservation = reservations.get(reservationId);
      if (reservation) reservation.status = status;
      reservationChanges.push({ id: reservationId, status });
    },
    async listLogisticsEvents(vehicleId) {
      return logistics.filter((event) => event.vehicleId === vehicleId).map((event) => ({ ...event }));
    },
    async createLogisticsEvent(data: LogisticsEventCreateData) {
      const row: LogisticsEventRow = {
        id: `logistics-${logistics.length + 1}`,
        vehicleId: data.vehicleId,
        eventType: data.eventType,
        location: data.location,
        description: data.description,
        eventAt: data.eventAt,
        createdBy: data.createdBy,
      };
      logistics.push(row);
      return { ...row };
    },
    async transaction<T>(fn: (tx: OrderRepository) => Promise<T>): Promise<T> {
      transactionCount += 1;
      const run = queue.then(() => fn(repo));
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };

  return {
    repo,
    orders,
    events,
    logistics,
    createdOrders,
    statusUpdates,
    vehicleSales,
    leadChanges,
    reservationChanges,
    transactions: () => transactionCount,
  };
}

let audits: AuditLogEntry[] = [];

function setup(repository?: OrderRepository) {
  audits = [];
  const audit = async (entry: AuditLogEntry) => {
    audits.push(entry);
  };
  if (repository) {
    configureOrderDependencies({ repository, audit });
  } else {
    configureOrderDependencies({ audit });
  }
}

function setupDependencies() {
  // A default audit sink so module-level defaults never touch Prisma during import.
  configureOrderDependencies({ audit: async (entry: AuditLogEntry) => void entry });
}

afterEach(() => {
  resetOrderDependencies();
  setupDependencies();
});

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    customerId: "customer-1",
    vehicleId: "vehicle-1",
    agreedVehiclePrice: 15_900_000,
    agreedTransportPrice: 1_500_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createOrder — permissions and validation
// ---------------------------------------------------------------------------

describe("createOrder — permissions and validation", () => {
  it("requires an authenticated staff member holding order.create", async () => {
    setup(makeRepository({ vehicles: [{ id: "vehicle-1", commercialStatus: "AVAILABLE" }] }).repo);
    await expect(createOrder(visitorActor, createInput())).rejects.toThrowError(/authent/i);
    await expect(createOrder(customerActor, createInput())).rejects.toThrowError(/refus/i);
    await expect(createOrder(staffActor(["order.view"]), createInput())).rejects.toThrowError(/refus/i);
  });

  it("rejects unknown fields, a missing or negative price", () => {
    expect(() => parseOrderCreate({ ...createInput(), salespersonId: "s" , extra: true })).toThrowError(/invalide/i);
    expect(() => parseOrderCreate({ customerId: "c", vehicleId: "v", agreedVehiclePrice: -1 })).toThrowError(/invalide/i);
    expect(() => parseOrderCreate({ customerId: "c", vehicleId: "v" })).toThrowError(/invalide/i);
  });
});

// ---------------------------------------------------------------------------
// createOrder — the sale transaction
// ---------------------------------------------------------------------------

describe("createOrder — atomic sale", () => {
  it("creates the order, marks the vehicle SOLD, audits and confirms the lead in one transaction", async () => {
    const repository = makeRepository({
      vehicles: [{ id: "vehicle-1", commercialStatus: "AVAILABLE" }],
      leads: [{ id: "lead-1", status: "NEGOTIATION" }],
      reservations: [{ id: "res-1", vehicleId: "vehicle-1", status: "CONFIRMED" }],
    });
    setup(repository.repo);

    const view = await createOrder(admin, createInput({ leadId: "lead-1", reservationId: "res-1" }));

    expect(view.reference).toMatch(/^CMD-\d{4}-\d{6}$/);
    expect(view.status).toBe("CONFIRMED");
    expect(view.salespersonId).toBe("staff-1");
    expect(view.agreedVehiclePrice).toBe("15900000.00");
    expect(view.agreedTransportPrice).toBe("1500000.00");

    expect(repository.createdOrders).toHaveLength(1);
    expect(repository.vehicleSales).toEqual([
      { id: "vehicle-1", status: "SOLD", soldAt: expect.any(Date) },
    ]);
    expect(repository.leadChanges).toEqual([{ id: "lead-1", status: "ORDER_CONFIRMED" }]);
    expect(repository.reservationChanges).toEqual([{ id: "res-1", status: "CONVERTED" }]);
    expect(repository.transactions()).toBe(1);

    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("vehicle.sell");
    expect(audits[0].entityType).toBe("Vehicle");
    expect(audits[0].entityId).toBe("vehicle-1");
    expect(audits[0].reason).toBeTruthy();
    expect(audits[0].newValues).toMatchObject({
      commercialStatus: "SOLD",
      leadStatus: "ORDER_CONFIRMED",
      reservationStatus: "CONVERTED",
      orderStatus: "CONFIRMED",
    });
  });

  it("closes the reservation as CONVERTED inside the same sale transaction (doc 09 §5)", async () => {
    const repository = makeRepository({
      vehicles: [{ id: "vehicle-1", commercialStatus: "RESERVED" }],
      reservations: [{ id: "res-1", vehicleId: "vehicle-1", status: "CONFIRMED" }],
    });
    setup(repository.repo);

    await createOrder(admin, createInput({ reservationId: "res-1" }));

    expect(repository.reservationChanges).toEqual([{ id: "res-1", status: "CONVERTED" }]);
    expect(repository.transactions()).toBe(1);
  });

  it("does not touch any reservation when none is attached", async () => {
    const repository = makeRepository({
      vehicles: [{ id: "vehicle-1", commercialStatus: "AVAILABLE" }],
      reservations: [{ id: "res-1", vehicleId: "vehicle-1", status: "CONFIRMED" }],
    });
    setup(repository.repo);

    await createOrder(admin, createInput());

    expect(repository.reservationChanges).toEqual([]);
  });

  it("refuses to convert a reservation attached to another vehicle", async () => {
    const repository = makeRepository({
      vehicles: [{ id: "vehicle-1", commercialStatus: "AVAILABLE" }],
      reservations: [{ id: "res-1", vehicleId: "vehicle-2", status: "CONFIRMED" }],
    });
    setup(repository.repo);

    await expect(createOrder(admin, createInput({ reservationId: "res-1" }))).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(repository.createdOrders).toHaveLength(0);
    expect(repository.reservationChanges).toEqual([]);
  });

  it("refuses to convert a reservation that is not convertible (cancelled/expired/converted)", async () => {
    for (const status of ["CANCELLED", "EXPIRED", "CONVERTED", "PENDING"] as const) {
      const repository = makeRepository({
        vehicles: [{ id: "vehicle-1", commercialStatus: "AVAILABLE" }],
        reservations: [{ id: "res-1", vehicleId: "vehicle-1", status }],
      });
      setup(repository.repo);

      await expect(createOrder(admin, createInput({ reservationId: "res-1" }))).rejects.toMatchObject({
        code: "CONFLICT",
      });
      expect(repository.createdOrders).toHaveLength(0);
      expect(repository.reservationChanges).toEqual([]);
    }
  });

  it("refuses an unknown reservation with a neutral NOT_FOUND and writes nothing", async () => {
    const repository = makeRepository({
      vehicles: [{ id: "vehicle-1", commercialStatus: "AVAILABLE" }],
    });
    setup(repository.repo);

    await expect(createOrder(admin, createInput({ reservationId: "res-x" }))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(repository.createdOrders).toHaveLength(0);
  });

  it("does not touch any lead when none is attached", async () => {
    const repository = makeRepository({
      vehicles: [{ id: "vehicle-1", commercialStatus: "RESERVED" }],
      leads: [{ id: "lead-1", status: "NEGOTIATION" }],
    });
    setup(repository.repo);

    await createOrder(admin, createInput());

    expect(repository.leadChanges).toEqual([]);
    expect(audits[0].newValues).toMatchObject({ leadStatus: null });
  });

  it("freezes the agreed prices as given (number and decimal string normalised to 2 decimals)", async () => {
    const repository = makeRepository({ vehicles: [{ id: "vehicle-1", commercialStatus: "AVAILABLE" }] });
    setup(repository.repo);

    await createOrder(admin, createInput({ agreedVehiclePrice: "15900000.5", agreedTransportPrice: 0 }));

    expect(repository.createdOrders[0].agreedVehiclePrice).toBe("15900000.50");
    expect(repository.createdOrders[0].agreedTransportPrice).toBe("0.00");
  });

  it("defaults currency to XOF", async () => {
    const repository = makeRepository({ vehicles: [{ id: "vehicle-1", commercialStatus: "AVAILABLE" }] });
    setup(repository.repo);

    const view = await createOrder(admin, createInput());
    expect(view.currency).toBe("XOF");
  });
});

// ---------------------------------------------------------------------------
// createOrder — availability and concurrency (BR-103, contrat §3.5)
// ---------------------------------------------------------------------------

describe("createOrder — availability and concurrency", () => {
  it("refuses an unknown vehicle with a neutral NOT_FOUND", async () => {
    const repository = makeRepository({});
    setup(repository.repo);
    await expect(createOrder(admin, createInput())).rejects.toThrowError(/introuvable/i);
    expect(repository.createdOrders).toHaveLength(0);
  });

  it("refuses a lead that does not exist, writing nothing", async () => {
    const repository = makeRepository({ vehicles: [{ id: "vehicle-1", commercialStatus: "AVAILABLE" }] });
    setup(repository.repo);
    await expect(createOrder(admin, createInput({ leadId: "missing" }))).rejects.toThrowError(/introuvable/i);
    expect(repository.createdOrders).toHaveLength(0);
    expect(repository.vehicleSales).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("refuses a vehicle already SOLD with CONFLICT and writes nothing", async () => {
    const repository = makeRepository({ vehicles: [{ id: "vehicle-1", commercialStatus: "SOLD" }] });
    setup(repository.repo);

    let code = "";
    try {
      await createOrder(admin, createInput());
    } catch (error) {
      code = (error as { code: string }).code;
    }
    expect(code).toBe("CONFLICT");
    expect(repository.createdOrders).toHaveLength(0);
    expect(repository.vehicleSales).toHaveLength(0);
  });

  it("refuses a vehicle that cannot transition to SOLD (DRAFT/UNAVAILABLE/ARCHIVED)", async () => {
    for (const status of ["DRAFT", "UNAVAILABLE", "ARCHIVED"] as const) {
      const repository = makeRepository({ vehicles: [{ id: "vehicle-1", commercialStatus: status }] });
      setup(repository.repo);
      await expect(createOrder(admin, createInput())).rejects.toThrowError(/Vente impossible/i);
    }
  });

  it("refuses a second active order through the transactional check", async () => {
    const repository = makeRepository({
      vehicles: [{ id: "vehicle-1", commercialStatus: "AVAILABLE" }],
      orders: [orderRow({ id: "existing", vehicleId: "vehicle-1", status: "PROCESSING" })],
    });
    setup(repository.repo);

    let code = "";
    try {
      await createOrder(admin, createInput());
    } catch (error) {
      code = (error as { code: string }).code;
    }
    expect(code).toBe("CONFLICT");
    expect(repository.createdOrders).toHaveLength(0);
  });

  it("two concurrent orders on the same vehicle yield exactly one order and one CONFLICT", async () => {
    const repository = makeRepository({ vehicles: [{ id: "vehicle-1", commercialStatus: "AVAILABLE" }] });
    setup(repository.repo);

    const results = await Promise.allSettled([
      createOrder(admin, createInput()),
      createOrder(admin, createInput()),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AppError);
    expect((rejected[0] as PromiseRejectedResult).reason.code).toBe("CONFLICT");
    expect(repository.createdOrders).toHaveLength(1);
    expect(repository.vehicleSales).toHaveLength(1);
  });

  it("surfaces the database partial-unique-index conflict as CONFLICT", async () => {
    const base = makeRepository({ vehicles: [{ id: "vehicle-1", commercialStatus: "AVAILABLE" }] });
    // The pre-check sees no active order, so only the unique index (emulated by `create`) catches it.
    const racing: OrderRepository = {
      ...base.repo,
      findActiveByVehicle: async () => null,
      create: async () => {
        throw new AppError("CONFLICT", "index unique partiel violé");
      },
      transaction: async <T>(fn: (tx: OrderRepository) => Promise<T>) => fn(racing),
    };
    setup(racing);

    let code = "";
    try {
      await createOrder(admin, createInput());
    } catch (error) {
      code = (error as { code: string }).code;
    }
    expect(code).toBe("CONFLICT");
    expect(base.vehicleSales).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// updateOrderStatus — transitions, audit, frozen prices
// ---------------------------------------------------------------------------

describe("updateOrderStatus", () => {
  it("requires order.update", async () => {
    setup(makeRepository({ orders: [orderRow()] }).repo);
    await expect(
      updateOrderStatus(staffActor(["order.view"]), "order-1", { status: "PROCESSING" }),
    ).rejects.toThrowError(/refus/i);
    await expect(updateOrderStatus(customerActor, "order-1", { status: "PROCESSING" })).rejects.toThrowError(
      /refus/i,
    );
  });

  it("applies an allowed transition, appends the history event and audits it", async () => {
    const repository = makeRepository({ orders: [orderRow({ status: "CONFIRMED" })] });
    setup(repository.repo);

    const detail = await updateOrderStatus(admin, "order-1", { status: "PROCESSING", reason: "En atelier" });

    expect(detail.status).toBe("PROCESSING");
    expect(detail.events).toHaveLength(1);
    expect(detail.events[0].status).toBe("PROCESSING");
    expect(repository.transactions()).toBe(1);
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("order.status.change");
    expect(audits[0].entityType).toBe("Order");
    expect(audits[0].entityId).toBe("order-1");
    expect(audits[0].reason).toBe("En atelier");
  });

  it("never touches the agreed prices (BR-105)", async () => {
    const repository = makeRepository({ orders: [orderRow({ status: "CONFIRMED" })] });
    setup(repository.repo);

    await updateOrderStatus(admin, "order-1", { status: "PROCESSING" });

    const values = repository.statusUpdates[0].values;
    expect(Object.keys(values)).not.toContain("agreedVehiclePrice");
    expect(Object.keys(values)).not.toContain("agreedTransportPrice");
    expect(Object.keys(values)).not.toContain("currency");
    expect(repository.orders[0].agreedVehiclePrice).toBe("15900000.00");
  });

  it("refuses an unlisted transition with CONFLICT", async () => {
    const repository = makeRepository({ orders: [orderRow({ status: "CONFIRMED" })] });
    setup(repository.repo);

    let code = "";
    try {
      await updateOrderStatus(admin, "order-1", { status: "DELIVERED" });
    } catch (error) {
      code = (error as { code: string }).code;
    }
    expect(code).toBe("CONFLICT");
    expect(repository.statusUpdates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("refuses to reopen a terminal order", async () => {
    setup(makeRepository({ orders: [orderRow({ status: "DELIVERED" })] }).repo);
    await expect(updateOrderStatus(admin, "order-1", { status: "CANCELLED" })).rejects.toThrowError(/impossible/i);
  });

  it("stamps delivered_at when the order is delivered", async () => {
    const repository = makeRepository({ orders: [orderRow({ status: "ARRIVED" })] });
    setup(repository.repo);

    const detail = await updateOrderStatus(admin, "order-1", { status: "DELIVERED", note: "Remise client" });

    expect(detail.deliveredAt).toBeInstanceOf(Date);
    expect(audits[0].reason).toBe("Remise client");
  });

  it("accepts an estimated arrival date on a transit transition", async () => {
    const repository = makeRepository({ orders: [orderRow({ status: "PROCESSING" })] });
    setup(repository.repo);
    const eta = new Date("2026-03-01T00:00:00Z");

    const detail = await updateOrderStatus(admin, "order-1", { status: "IN_TRANSIT", estimatedArrivalAt: eta });

    expect(detail.estimatedArrivalAt).toEqual(eta);
  });

  it("returns NOT_FOUND for an unknown order", async () => {
    setup(makeRepository({}).repo);
    await expect(updateOrderStatus(admin, "missing", { status: "PROCESSING" })).rejects.toThrowError(
      /introuvable/i,
    );
  });

  it("rejects an unknown target status and unknown fields", () => {
    expect(() => parseOrderStatusUpdate({ status: "SHIPPED" })).toThrowError(/invalide/i);
    expect(() => parseOrderStatusUpdate({ status: "PROCESSING", extra: true })).toThrowError(/invalide/i);
  });
});

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

describe("readOrder / listOrders / listOwnOrders", () => {
  it("readOrder requires order.view and returns the events history", async () => {
    const repository = makeRepository({ orders: [orderRow()] });
    setup(repository.repo);

    await expect(readOrder(customerActor, "order-1")).rejects.toThrowError(/refus/i);

    const detail = await readOrder(staffActor(["order.view"]), "order-1");
    expect(detail.id).toBe("order-1");
    expect(detail.events).toEqual([]);
  });

  it("listOrders requires order.view and validates filters strictly", async () => {
    const repository = makeRepository({
      orders: [orderRow(), orderRow({ id: "order-2", reference: "CMD-2026-000002", status: "DELIVERED" })],
    });
    setup(repository.repo);

    await expect(listOrders(customerActor)).rejects.toThrowError(/refus/i);
    await expect(listOrders(staffActor(["vehicle.view"]))).rejects.toThrowError(/refus/i);

    const all = await listOrders(staffActor(["order.view"]));
    expect(all).toHaveLength(2);

    const delivered = await listOrders(staffActor(["order.view"]), { status: "DELIVERED" });
    expect(delivered.map((order) => order.id)).toEqual(["order-2"]);

    expect(() => parseOrderFilters({ unknown: true } as never)).toThrowError(/invalides/i);
  });

  it("listOwnOrders requires a customer and scopes strictly to the actor's own orders", async () => {
    const repository = makeRepository({
      orders: [
        orderRow({ id: "own", customerId: "customer-1" }),
        orderRow({ id: "other", reference: "CMD-2026-000002", customerId: "customer-2" }),
      ],
    });
    setup(repository.repo);

    await expect(listOwnOrders(admin)).rejects.toThrowError(/refus/i);
    await expect(listOwnOrders(visitorActor)).rejects.toThrowError(/authent/i);

    const own = await listOwnOrders(customerActor);
    expect(own.map((order) => order.id)).toEqual(["own"]);
  });
});

// ---------------------------------------------------------------------------
// Logistics history
// ---------------------------------------------------------------------------

describe("logistics events", () => {
  it("addLogisticsEvent requires order.update, checks the vehicle exists and stamps the creator", async () => {
    const repository = makeRepository({ vehicles: [{ id: "vehicle-1", commercialStatus: "AVAILABLE" }] });
    setup(repository.repo);

    await expect(
      addLogisticsEvent(staffActor(["order.view"]), {
        vehicleId: "vehicle-1",
        eventType: "SHIPPED",
      }),
    ).rejects.toThrowError(/refus/i);

    const event = await addLogisticsEvent(admin, {
      vehicleId: "vehicle-1",
      eventType: "SHIPPED",
      location: "Shanghai",
      description: "Embarquement",
    });

    expect(event.eventType).toBe("SHIPPED");
    expect(event.createdBy).toBe("staff-1");
    expect(event.eventAt).toBeInstanceOf(Date);

    await expect(
      addLogisticsEvent(admin, { vehicleId: "missing", eventType: "SHIPPED" }),
    ).rejects.toThrowError(/introuvable/i);
  });

  it("validates the event type and rejects unknown fields", () => {
    expect(() => parseLogisticsEventInput({ vehicleId: "v", eventType: "FLYING" })).toThrowError(/invalide/i);
    expect(() =>
      parseLogisticsEventInput({ vehicleId: "v", eventType: "SHIPPED", extra: 1 }),
    ).toThrowError(/invalide/i);
  });

  it("listLogisticsEvents requires order.view and returns the vehicle's history", async () => {
    const repository = makeRepository({ vehicles: [{ id: "vehicle-1", commercialStatus: "AVAILABLE" }] });
    setup(repository.repo);
    await addLogisticsEvent(admin, { vehicleId: "vehicle-1", eventType: "PORT_CHINA" });
    await addLogisticsEvent(admin, { vehicleId: "vehicle-1", eventType: "AT_SEA" });

    await expect(listLogisticsEvents(customerActor, "vehicle-1")).rejects.toThrowError(/refus/i);

    const events = await listLogisticsEvents(staffActor(["order.view"]), "vehicle-1");
    expect(events.map((event) => event.eventType)).toEqual(["PORT_CHINA", "AT_SEA"]);
  });
});

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

describe("toOrderView", () => {
  it("projects every field of the row", () => {
    const row = orderRow({ status: "IN_TRANSIT", estimatedArrivalAt: new Date("2026-04-01T00:00:00Z") });
    expect(toOrderView(row)).toEqual(row);
  });
});
