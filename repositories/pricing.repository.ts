import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { translatePrismaError } from "@/lib/prisma/errors";
import type {
  PricingRepository,
  VehiclePriceCreateInput,
  VehiclePriceRow,
} from "@/services/pricing.service";

/**
 * Accès Prisma aux prix de véhicule (`vehicle_prices`, doc 03 §9).
 *
 * Une seule `select` explicite : elle contient l'identifiant (nécessaire à l'administration) et les
 * montants, jamais de colonne technique de rattachement.
 */

export const vehiclePriceSelect = {
  id: true,
  pricingProfile: true,
  priceType: true,
  baseAmount: true,
  transportAmount: true,
  currency: true,
  validFrom: true,
  validTo: true,
  isActive: true,
} as const;

export type VehiclePriceDbRow = {
  id: string;
  pricingProfile: VehiclePriceRow["pricingProfile"];
  priceType: VehiclePriceRow["priceType"];
  baseAmount: Prisma.Decimal;
  transportAmount: Prisma.Decimal | null;
  currency: string;
  validFrom: Date | null;
  validTo: Date | null;
  isActive: boolean;
};

/** Traduction explicite ligne SQL → contrat du domaine (testable sans base). */
export function toVehiclePriceRow(row: VehiclePriceDbRow): VehiclePriceRow {
  return {
    id: row.id,
    pricingProfile: row.pricingProfile,
    priceType: row.priceType,
    baseAmount: row.baseAmount.toFixed(2),
    transportAmount: row.transportAmount ? row.transportAmount.toFixed(2) : null,
    currency: row.currency,
    validFrom: row.validFrom ?? null,
    validTo: row.validTo ?? null,
    isActive: row.isActive,
  };
}

export function createPricingRepository(client: Prisma.TransactionClient = prisma): PricingRepository {
  async function listPrices(vehicleId: string): Promise<VehiclePriceRow[]> {
    const rows = await client.vehiclePrice.findMany({
      where: { vehicleId },
      select: vehiclePriceSelect,
      orderBy: [{ pricingProfile: "asc" }, { validFrom: "desc" }],
    });

    return rows.map(toVehiclePriceRow);
  }

  async function listActivePrices(vehicleId: string): Promise<VehiclePriceRow[]> {
    const rows = await client.vehiclePrice.findMany({
      where: { vehicleId, isActive: true },
      select: vehiclePriceSelect,
      orderBy: { validFrom: "desc" },
    });

    return rows.map(toVehiclePriceRow);
  }

  async function createPrice(
    vehicleId: string,
    input: VehiclePriceCreateInput,
  ): Promise<VehiclePriceRow> {
    try {
      const row = await client.vehiclePrice.create({
        data: {
          vehicleId,
          pricingProfile: input.pricingProfile,
          priceType: input.priceType,
          baseAmount: input.baseAmount,
          transportAmount: input.transportAmount,
          currency: input.currency,
          validFrom: input.validFrom,
          validTo: input.validTo,
          isActive: input.isActive,
        },
        select: vehiclePriceSelect,
      });

      return toVehiclePriceRow(row);
    } catch (error) {
      const translated = translatePrismaError(error, "Prix déjà enregistré.");
      if (translated) throw translated;
      throw error;
    }
  }

  return { listPrices, listActivePrices, createPrice };
}