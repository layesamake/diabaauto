import { beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import type { AuditLogEntry } from "@/services/audit.service";
import {
  configurePricingDependencies,
  listVehiclePrices,
  parseVehiclePrice,
  resolveVehiclePrice,
  setVehiclePrice,
  type PricingRepository,
  type VehiclePriceCreateInput,
  type VehiclePriceRow,
} from "@/services/pricing.service";
import { toVehiclePriceRow } from "@/repositories/pricing.repository";
import { APPROVED_RESELLER, STANDARD_CUSTOMER, staffActor, visitorActor } from "@/tests/unit/support/actors";

/** Acteur de prix : le visiteur du contrat `PricingActor`. */
const visitor = { kind: "visitor" } as const;
const NOW = new Date("2026-06-01T00:00:00.000Z");
const VEHICLE = "11111111-1111-4111-8111-111111111111";

function price(overrides: Partial<VehiclePriceRow> = {}): VehiclePriceRow {
  return {
    id: "price-1",
    pricingProfile: "STANDARD",
    priceType: "REGULAR",
    baseAmount: "12000000.00",
    transportAmount: "1500000.00",
    currency: "XOF",
    validFrom: null,
    validTo: null,
    isActive: true,
    ...overrides,
  };
}

function fakePricingRepository(initial: VehiclePriceRow[] = []) {
  let rows = [...initial];
  let counter = 0;

  const repository: PricingRepository = {
    async listPrices() {
      return [...rows];
    },
    async listActivePrices() {
      return rows.filter((row) => row.isActive);
    },
    async createPrice(_vehicleId: string, input: VehiclePriceCreateInput) {
      const created: VehiclePriceRow = { id: `price-${++counter}`, ...input };
      rows = [...rows, created];
      return created;
    },
  };

  return { repository, all: () => [...rows] };
}

let auditEntries: AuditLogEntry[];

beforeEach(() => {
  auditEntries = [];
});

describe("resolveVehiclePrice (lot L2 §2.3)", () => {
  it("sert le prix STANDARD au visiteur et au client Standard", () => {
    const input = { prices: [price()] };
    const expected = { amount: "12000000.00", transportAmount: "1500000.00", currency: "XOF", priceType: "STANDARD" };

    expect(resolveVehiclePrice(input, visitor, NOW)).toEqual(expected);
    expect(resolveVehiclePrice(input, STANDARD_CUSTOMER, NOW)).toEqual(expected);
  });

  it("ne sert le tarif RESELLER qu'à un client APPROVED", () => {
    const prices = [price(), price({ id: "price-2", pricingProfile: "RESELLER", baseAmount: "11000000.00" })];

    expect(resolveVehiclePrice({ prices }, APPROVED_RESELLER, NOW)).toEqual({
      amount: "11000000.00",
      transportAmount: "1500000.00",
      currency: "XOF",
      priceType: "RESELLER",
    });

    expect(resolveVehiclePrice({ prices }, { kind: "customer", resellerStatus: "PENDING" }, NOW)).toEqual({
      amount: "12000000.00",
      transportAmount: "1500000.00",
      currency: "XOF",
      priceType: "STANDARD",
    });
  });

  it("replie sur le STANDARD avec l'anomalie MISSING_RESELLER_PRICE", () => {
    expect(resolveVehiclePrice({ prices: [price()] }, APPROVED_RESELLER, NOW)).toEqual({
      amount: "12000000.00",
      transportAmount: "1500000.00",
      currency: "XOF",
      priceType: "STANDARD",
      anomaly: "MISSING_RESELLER_PRICE",
    });
  });

  it("ignore les lignes inactives et les fenêtres de validité dépassées", () => {
    const prices = [
      price({ id: "p1", pricingProfile: "RESELLER", baseAmount: "11000000.00", isActive: false }),
      price({ id: "p2", baseAmount: "99999999.00", validTo: new Date("2025-12-31T00:00:00.000Z") }),
      price({ id: "p3", baseAmount: "13000000.00", validFrom: new Date("2027-01-01T00:00:00.000Z") }),
    ];

    expect(resolveVehiclePrice({ prices }, APPROVED_RESELLER, NOW)).toBeNull();
    expect(resolveVehiclePrice({ prices }, visitor, NOW)).toBeNull();
  });

  it("retient la ligne la plus récemment applicable en cas de plusieurs prix actifs", () => {
    const prices = [
      price({ id: "p1", baseAmount: "12000000.00", validFrom: new Date("2026-01-01T00:00:00.000Z") }),
      price({ id: "p2", baseAmount: "12500000.00", validFrom: new Date("2026-05-01T00:00:00.000Z") }),
    ];

    expect(resolveVehiclePrice({ prices }, visitor, NOW)?.amount).toBe("12500000.00");
  });

  it("ne produit aucun prix lorsqu'aucune ligne standard n'est serviable", () => {
    expect(resolveVehiclePrice({ prices: [] }, visitor, NOW)).toBeNull();
    expect(resolveVehiclePrice({ prices: [price({ pricingProfile: "RESELLER" })] }, visitor, NOW)).toBeNull();
  });

  it("conserve la forme historique `{ publicPrice, resellerPrice }` sans régression", () => {
    const legacy = { publicPrice: "12000000.00", resellerPrice: "11000000.00", currency: "XOF" };

    expect(resolveVehiclePrice(legacy, visitor)).toEqual({
      amount: "12000000.00",
      transportAmount: null,
      currency: "XOF",
      priceType: "STANDARD",
    });
    expect(resolveVehiclePrice(legacy, APPROVED_RESELLER)).toEqual({
      amount: "11000000.00",
      transportAmount: null,
      currency: "XOF",
      priceType: "RESELLER",
    });
    expect(
      resolveVehiclePrice({ ...legacy, resellerPrice: null }, APPROVED_RESELLER),
    ).toEqual({
      amount: "12000000.00",
      transportAmount: null,
      currency: "XOF",
      priceType: "STANDARD",
      anomaly: "MISSING_RESELLER_PRICE",
    });
  });

  it("convertit les DECIMAL de Prisma en chaînes, jamais en flottants", () => {
    const row = toVehiclePriceRow({
      id: "price-1",
      pricingProfile: "STANDARD",
      priceType: "PROMOTIONAL",
      baseAmount: new Prisma.Decimal("12000000.00"),
      transportAmount: null,
      currency: "XOF",
      validFrom: null,
      validTo: null,
      isActive: true,
    });

    expect(row.id).toBe("price-1");
    expect(row.baseAmount).toBe("12000000.00");
    expect(row.transportAmount).toBeNull();
    expect(row.priceType).toBe("PROMOTIONAL");
  });
});

describe("prix du back-office (extension minimale T23)", () => {
  it("liste les prix du véhicule pour un acteur habilité", async () => {
    const fake = fakePricingRepository([price(), price({ id: "p2", pricingProfile: "RESELLER" })]);
    configurePricingDependencies({ repository: fake.repository });

    const rows = await listVehiclePrices(staffActor(), VEHICLE);
    expect(rows.map((row) => row.id)).toEqual(["price-1", "p2"]);

    await expect(listVehiclePrices(visitorActor, VEHICLE)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("crée un prix, exige vehicle.price_edit et trace vehicle.price.change", async () => {
    const fake = fakePricingRepository();
    configurePricingDependencies({
      repository: fake.repository,
      audit: async (entry) => {
        auditEntries.push(entry);
      },
    });

    await expect(
      setVehiclePrice(staffActor(["vehicle.view"]), VEHICLE, {
        pricingProfile: "STANDARD",
        baseAmount: "12000000.00",
        currency: "xof",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const created = await setVehiclePrice(staffActor(), VEHICLE, {
      pricingProfile: "STANDARD",
      baseAmount: 12000000,
      currency: "xof",
    });

    expect(created.id).toBeDefined();
    expect(fake.all()[0]?.baseAmount).toBe("12000000.00");
    expect(fake.all()[0]?.currency).toBe("XOF");
    expect(fake.all()[0]?.priceType).toBe("REGULAR");
    expect(auditEntries.map((entry) => entry.action)).toEqual(["vehicle.price.change"]);
  });

  it("rejette un montant, une devise ou une fenêtre de validité invalides", () => {
    expect(() =>
      parseVehiclePrice({ pricingProfile: "STANDARD", baseAmount: "12,5", currency: "XOF" }),
    ).toThrowError(/prix invalide/i);

    expect(() =>
      parseVehiclePrice({ pricingProfile: "STANDARD", baseAmount: "1000", currency: "XOF1" }),
    ).toThrowError(/prix invalide/i);

    expect(() =>
      parseVehiclePrice({
        pricingProfile: "STANDARD",
        baseAmount: "1000",
        currency: "XOF",
        validFrom: "2026-06-01T00:00:00.000Z",
        validTo: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrowError(/précède/i);
  });
});