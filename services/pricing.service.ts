import { z } from "zod";
import { AppError } from "@/lib/errors";
import { createAuditWriter } from "@/repositories/audit.repository";
import { createPricingRepository } from "@/repositories/pricing.repository";
import { requireStaff } from "@/services/access.service";
import { buildAuditEntry } from "@/services/audit.service";
import type { Actor } from "@/services/identity.service";
import type { AuditWriter } from "@/services/vehicle.service";

/**
 * Prix de véhicule (doc 03 §9, contrat L2 §2.3).
 *
 * Le prix est désormais lu dans `vehicle_prices` et non dans des colonnes de `vehicles` :
 * - seul un client `resellerStatus === "APPROVED"` accède au tarif `RESELLER` ;
 * - à défaut de prix Revendeur actif, repli sur le prix `STANDARD` avec l'anomalie
 *   `MISSING_RESELLER_PRICE` ;
 * - aucune remise ni règle de remplacement n'est inventée ;
 * - aucune donnée confidentielle n'est transmise à un acteur non autorisé.
 *
 * La logique Standard/Revendeur complète, le transport, le FX et les tests T-PRICE restent au lot L3.
 *
 * Lot 3 §A.4 (extension ADDITIVE, aucune règle modifiée) : `ResolvedPrice` porte désormais
 * `transportAmount`, le transport de la ligne RETENUE (`null` si cette ligne n'en porte pas), pour
 * que le catalogue public affiche le prix véhicule et le transport en deux lignes distinctes
 * (BR-006). Les appelants historiques (`{ publicPrice, resellerPrice }`) reçoivent `null`.
 *
 * Audit : `vehicle.price.change` (action EXISTANTE du corpus) trace toute création de prix ; aucune
 * action n'est inventée. La persistance partage la transaction de l'opération auditée.
 */

export type ResellerStatus = "NOT_APPLICABLE" | "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";

export type PricingActor =
  | { kind: "visitor" }
  | { kind: "customer"; resellerStatus: ResellerStatus };

export type PriceInput = {
  publicPrice: string;
  resellerPrice?: string | null;
  currency: "XOF" | string;
};

export type ResolvedPrice = {
  amount: string;
  /** Transport de la ligne RETENUE (`null` si la ligne n'en porte pas) — BR-006, contrat lot 3 §A.4. */
  transportAmount: string | null;
  currency: string;
  priceType: "STANDARD" | "RESELLER";
  anomaly?: "MISSING_RESELLER_PRICE";
};

/**
 * Ligne `vehicle_prices` réduite à ce qui détermine le prix servi. Le montant reste une chaîne
 * décimale (`DECIMAL(18,2)`), jamais un flottant.
 */
export type VehiclePriceRow = {
  id: string;
  pricingProfile: "STANDARD" | "RESELLER";
  priceType: "REGULAR" | "PROMOTIONAL";
  baseAmount: string;
  transportAmount: string | null;
  currency: string;
  validFrom: Date | null;
  validTo: Date | null;
  isActive: boolean;
};

export type VehiclePriceCreateInput = {
  pricingProfile: "STANDARD" | "RESELLER";
  priceType: "REGULAR" | "PROMOTIONAL";
  baseAmount: string;
  transportAmount: string | null;
  currency: string;
  validFrom: Date | null;
  validTo: Date | null;
  isActive: boolean;
};

export type PricingRepository = {
  /** Toutes les lignes d'un véhicule, pour l'écran d'administration. */
  listPrices(vehicleId: string): Promise<VehiclePriceRow[]>;
  /** Lignes actives d'un véhicule, pour le calcul du prix servi. */
  listActivePrices(vehicleId: string): Promise<VehiclePriceRow[]>;
  createPrice(vehicleId: string, input: VehiclePriceCreateInput): Promise<VehiclePriceRow>;
};

export type PricingDependencies = { repository: PricingRepository; audit: AuditWriter };

let dependencies: PricingDependencies = {
  repository: createPricingRepository(),
  audit: createAuditWriter(),
};

/** Remplace le repository ou la piste d'audit (tests unitaires, ou composition serveur). */
export function configurePricingDependencies(next: Partial<PricingDependencies>): void {
  dependencies = { ...dependencies, ...next };
}

/** Rétablit les dépendances Prisma par défaut. */
export function resetPricingDependencies(): void {
  dependencies = { repository: createPricingRepository(), audit: createAuditWriter() };
}

// ---------------------------------------------------------------------------
// Lecture back-office et écriture de prix (extension minimale T23)
// ---------------------------------------------------------------------------

const idField = z.string().trim().uuid();

/** Liste administrable des prix d'un véhicule ; exige `vehicle.view`. */
export async function listVehiclePrices(actor: Actor, vehicleId: string): Promise<VehiclePriceRow[]> {
  requireStaff(actor, "vehicle.view");
  return dependencies.repository.listPrices(idOf(vehicleId));
}

/**
 * Crée une ligne de prix ; exige `vehicle.price_edit` et trace `vehicle.price.change`.
 * Aucune règle de transport ni de change n'est appliquée ici (lot L3).
 */
export async function setVehiclePrice(
  actor: Actor,
  vehicleId: string,
  input: unknown,
): Promise<{ id: string }> {
  const staff = requireStaff(actor, "vehicle.price_edit");
  const vehicle = idOf(vehicleId);
  const parsed = parseVehiclePrice(input);

  const created = await dependencies.repository.createPrice(vehicle, parsed);

  await dependencies.audit(
    buildAuditEntry({
      actorProfileId: staff.profileId,
      action: "vehicle.price.change",
      entityType: "VehiclePrice",
      entityId: created.id,
      oldValues: null,
      newValues: {
        vehicleId: vehicle,
        pricingProfile: parsed.pricingProfile,
        priceType: parsed.priceType,
        baseAmount: parsed.baseAmount,
        transportAmount: parsed.transportAmount,
        currency: parsed.currency,
      },
    }),
  );

  return { id: created.id };
}

const amountField = z.union([
  z.string().trim().regex(/^\d{1,16}(?:\.\d{1,2})?$/),
  z.number().nonnegative().max(10_000_000_000),
]);

const dateField = z.union([z.string().trim().min(8).max(40), z.date()]).nullish();

const priceSchema = z
  .object({
    pricingProfile: z.enum(["STANDARD", "RESELLER"]),
    priceType: z.enum(["REGULAR", "PROMOTIONAL"]).optional(),
    baseAmount: amountField,
    transportAmount: amountField.nullish(),
    currency: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/),
    validFrom: dateField,
    validTo: dateField,
  })
  .strict();

export function parseVehiclePrice(input: unknown): VehiclePriceCreateInput {
  const result = priceSchema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION", "Entrée de prix invalide.");
  }

  const data = result.data;
  const validFrom = toDate(data.validFrom ?? null);
  const validTo = toDate(data.validTo ?? null);
  if (validFrom && validTo && validTo.getTime() < validFrom.getTime()) {
    throw new AppError("VALIDATION", "La fin de validité précède le début.");
  }

  return {
    pricingProfile: data.pricingProfile,
    priceType: data.priceType ?? "REGULAR",
    baseAmount: toAmount(data.baseAmount),
    transportAmount: data.transportAmount === null || data.transportAmount === undefined ? null : toAmount(data.transportAmount),
    currency: data.currency.toUpperCase(),
    validFrom,
    validTo,
    isActive: true,
  };
}

// ---------------------------------------------------------------------------
// Résolution du prix servi
// ---------------------------------------------------------------------------

/** Entrée de `resolveVehiclePrice` : lignes `vehicle_prices` actives (contrat §2bis). */
export type VehiclePriceResolutionInput = { prices: readonly VehiclePriceRow[] };

/**
 * Signature conservée (contrat §2bis) : l'entrée canonique est `{ prices }` (lignes de prix actives).
 * La forme historique `{ publicPrice, resellerPrice, currency }` reste acceptée pour les appelants
 * antérieurs au lot L2 (compatibilité stricte, mêmes règles).
 */
export function resolveVehiclePrice(
  input: PriceInput | VehiclePriceResolutionInput,
  actor: PricingActor,
  now: Date = new Date(),
): ResolvedPrice | null {
  if (isRowInput(input)) {
    return resolveFromRows(input.prices, actor, now);
  }

  const isApprovedReseller = actor.kind === "customer" && actor.resellerStatus === "APPROVED";
  if (!isApprovedReseller) {
    return {
      amount: input.publicPrice,
      transportAmount: null,
      currency: input.currency,
      priceType: "STANDARD",
    };
  }

  if (!input.resellerPrice) {
    return {
      amount: input.publicPrice,
      transportAmount: null,
      currency: input.currency,
      priceType: "STANDARD",
      anomaly: "MISSING_RESELLER_PRICE",
    };
  }

  return {
    amount: input.resellerPrice,
    transportAmount: null,
    currency: input.currency,
    priceType: "RESELLER",
  };
}

/**
 * Résolution depuis les lignes `vehicle_prices` (contrat §2.3).
 * `null` signifie « aucun prix servi » : l'appelant décide (le mode « prix sur demande » du doc 03
 * §6.1 n'a pas de support de modélisation — décision D24 — et n'est pas inventé ici).
 */
export function resolveFromRows(
  rows: readonly VehiclePriceRow[],
  actor: PricingActor,
  now: Date = new Date(),
): ResolvedPrice | null {
  const active = rows.filter((row) => row.isActive && isWithinValidity(row, now));
  const standard = pickPrice(active, "STANDARD");
  const isApprovedReseller = actor.kind === "customer" && actor.resellerStatus === "APPROVED";

  if (isApprovedReseller) {
    const reseller = pickPrice(active, "RESELLER");
    if (reseller) {
      return {
        amount: reseller.baseAmount,
        transportAmount: reseller.transportAmount,
        currency: reseller.currency,
        priceType: "RESELLER",
      };
    }
  }

  if (!standard) {
    return null;
  }

  if (isApprovedReseller) {
    return {
      amount: standard.baseAmount,
      transportAmount: standard.transportAmount,
      currency: standard.currency,
      priceType: "STANDARD",
      anomaly: "MISSING_RESELLER_PRICE",
    };
  }

  return {
    amount: standard.baseAmount,
    transportAmount: standard.transportAmount,
    currency: standard.currency,
    priceType: "STANDARD",
  };
}

/** Alias historique conservé pour les appelants du lot L2 (`resolveFromRows`). */
export const resolveVehiclePriceFromRows = resolveFromRows;

/** Une ligne est valide si sa fenêtre de validité (optionnelle) contient l'instant considéré. */
export function isWithinValidity(row: VehiclePriceRow, now: Date): boolean {
  if (row.validFrom && row.validFrom.getTime() > now.getTime()) return false;
  if (row.validTo && row.validTo.getTime() < now.getTime()) return false;
  return true;
}

function isRowInput(input: PriceInput | VehiclePriceResolutionInput): input is VehiclePriceResolutionInput {
  return Array.isArray((input as VehiclePriceResolutionInput).prices);
}

/**
 * Choix déterministe : la ligne la plus récemment applicable, à égalité la promotionnelle puis la
 * régulière (ordre alphabétique stable des types).
 */
function pickPrice(
  rows: readonly VehiclePriceRow[],
  profile: "STANDARD" | "RESELLER",
): VehiclePriceRow | null {
  const candidates = rows.filter((row) => row.pricingProfile === profile);
  if (candidates.length === 0) return null;

  return [...candidates].sort(comparePrices)[0] ?? null;
}

function comparePrices(left: VehiclePriceRow, right: VehiclePriceRow): number {
  const leftFrom = left.validFrom?.getTime() ?? Number.NEGATIVE_INFINITY;
  const rightFrom = right.validFrom?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (leftFrom !== rightFrom) return rightFrom - leftFrom;

  return left.priceType.localeCompare(right.priceType);
}

function toAmount(value: string | number): string {
  return typeof value === "number" ? value.toFixed(2) : Number.parseFloat(value).toFixed(2);
}

function toDate(value: string | Date | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError("VALIDATION", "Date de validité invalide.");
  }
  return date;
}

function idOf(value: string): string {
  const result = idField.safeParse(value);
  if (!result.success) {
    throw new AppError("VALIDATION", "Identifiant de véhicule invalide.");
  }

  return result.data;
}