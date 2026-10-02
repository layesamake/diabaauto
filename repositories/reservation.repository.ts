import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { translatePrismaError } from "@/lib/prisma/errors";
import { nextReservationSequence } from "@/lib/reservation-reference";
import type {
  DepositStatus,
  ReservationCreateData,
  ReservationDepositValues,
  ReservationFilters,
  ReservationRepository,
  ReservationRow,
  ReservationStatusValues,
} from "@/services/reservation.service";
import type { VehicleCommercialStatus } from "@/services/transitions.service";

/**
 * Accès Prisma aux réservations (`reservations`, contrat lot 6 §2.2, doc 03 §12).
 *
 * Une seule `select` explicite : elle ne contient que les colonnes nécessaires à la projection du
 * service (`ReservationRow`). La colonne scalaire `confirmed_by` (modèle `confirmedById`) est exposée
 * au service sous le nom `confirmedBy`, sans jamais laisser fuiter le modèle Prisma complet.
 *
 * Invariant en base non exprimable en Prisma : l'index unique PARTIEL
 * `reservations_one_active_per_vehicle_idx` (WHERE status IN ('PENDING','CONFIRMED')). Sa violation
 * (code `P2002`) est traduite en `AppError("CONFLICT")`, ce qui protège deux instances serveur
 * concurrentes même quand le contrôle transactionnel du service ne les voit pas encore l'une
 * l'autre (contrat §3.5, T45).
 *
 * Les effets sur le véhicule (`readVehicleCommercialStatus` / `setVehicleCommercialStatus`) sont
 * portés par ce même port afin que « Reservation CONFIRMED + Vehicle RESERVED + Audit » (doc 09
 * §10) tienne dans **une seule** transaction.
 */

/** Colonnes strictement nécessaires à la projection `ReservationRow`. */
export const reservationSelect = {
  id: true,
  reference: true,
  vehicleId: true,
  customerId: true,
  leadId: true,
  status: true,
  expiresAt: true,
  agreedPrice: true,
  depositRequired: true,
  depositAmount: true,
  depositCurrency: true,
  depositStatus: true,
  externalDepositReference: true,
  confirmedById: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type ReservationDbRow = {
  id: string;
  reference: string;
  vehicleId: string;
  customerId: string;
  leadId: string | null;
  status: ReservationRow["status"];
  expiresAt: Date | null;
  agreedPrice: Prisma.Decimal | null;
  depositRequired: boolean;
  depositAmount: Prisma.Decimal | null;
  depositCurrency: string | null;
  depositStatus: DepositStatus;
  externalDepositReference: string | null;
  confirmedById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Traduction explicite ligne SQL → contrat du domaine (testable sans base). */
export function toReservationRow(row: ReservationDbRow): ReservationRow {
  return {
    id: row.id,
    reference: row.reference,
    vehicleId: row.vehicleId,
    customerId: row.customerId,
    leadId: row.leadId ?? null,
    status: row.status,
    expiresAt: row.expiresAt ?? null,
    agreedPrice: row.agreedPrice ? row.agreedPrice.toFixed(2) : null,
    depositRequired: row.depositRequired,
    depositAmount: row.depositAmount ? row.depositAmount.toFixed(2) : null,
    depositCurrency: row.depositCurrency ?? null,
    depositStatus: row.depositStatus,
    externalDepositReference: row.externalDepositReference ?? null,
    confirmedBy: row.confirmedById ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** États d'une réservation « active » (invariant en base : une seule par véhicule). */
const ACTIVE_STATUSES: readonly ReservationRow["status"][] = ["PENDING", "CONFIRMED"];

/** Construit le filtre `where` borné de la liste back-office. */
export function toReservationWhere(filters: ReservationFilters = {}): Prisma.ReservationWhereInput {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.search
      ? { reference: { contains: filters.search, mode: "insensitive" as const } }
      : {}),
  };
}

export function createReservationRepository(
  client: Prisma.TransactionClient = prisma,
): ReservationRepository {
  return {
    async nextReferenceSequence(year: number) {
      const rows = await client.reservation.findMany({
        where: { reference: { startsWith: `RES-${year}-` } },
        select: { reference: true },
      });

      return nextReservationSequence(year, rows.map((row) => row.reference));
    },

    async findActiveByVehicle(vehicleId: string) {
      const row = await client.reservation.findFirst({
        where: { vehicleId, status: { in: [...ACTIVE_STATUSES] } },
        select: reservationSelect,
        orderBy: { createdAt: "desc" },
      });

      return row ? toReservationRow(row) : null;
    },

    async create(data: ReservationCreateData) {
      try {
        const row = await client.reservation.create({
          data: {
            id: globalThis.crypto.randomUUID(),
            reference: data.reference,
            vehicleId: data.vehicleId,
            customerId: data.customerId,
            leadId: data.leadId,
            status: data.status,
            expiresAt: data.expiresAt,
            agreedPrice: data.agreedPrice,
            depositRequired: data.depositRequired,
            depositAmount: data.depositAmount,
            depositCurrency: data.depositCurrency,
            depositStatus: data.depositStatus,
            updatedAt: new Date(),
          },
          select: reservationSelect,
        });

        return toReservationRow(row);
      } catch (error) {
        const translated = translatePrismaError(
          error,
          "Une réservation active existe déjà pour ce véhicule.",
        );
        if (translated) throw translated;
        throw error;
      }
    },

    async findById(id: string) {
      const row = await client.reservation.findUnique({
        where: { id },
        select: reservationSelect,
      });

      return row ? toReservationRow(row) : null;
    },

    async list(filters: ReservationFilters) {
      const rows = await client.reservation.findMany({
        where: toReservationWhere(filters),
        select: reservationSelect,
        orderBy: { createdAt: "desc" },
      });

      return rows.map(toReservationRow);
    },

    async listByCustomer(customerId: string) {
      const rows = await client.reservation.findMany({
        where: { customerId },
        select: reservationSelect,
        orderBy: { createdAt: "desc" },
      });

      return rows.map(toReservationRow);
    },

    async updateStatus(id: string, values: ReservationStatusValues) {
      const data: Prisma.ReservationUncheckedUpdateInput = {
        status: values.status,
        ...(values.confirmedBy !== undefined ? { confirmedById: values.confirmedBy } : {}),
      };

      try {
        const row = await client.reservation.update({
          where: { id },
          data,
          select: reservationSelect,
        });

        return toReservationRow(row);
      } catch (error) {
        const translated = translatePrismaError(error, "Réservation déjà attribuée.");
        if (translated) throw translated;
        throw error;
      }
    },

    async updateDeposit(id: string, values: ReservationDepositValues) {
      const data: Prisma.ReservationUncheckedUpdateInput = {
        depositStatus: values.depositStatus,
        ...(values.externalDepositReference !== undefined
          ? { externalDepositReference: values.externalDepositReference }
          : {}),
        ...(values.depositAmount !== undefined ? { depositAmount: values.depositAmount } : {}),
        ...(values.depositCurrency !== undefined ? { depositCurrency: values.depositCurrency } : {}),
      };

      const row = await client.reservation.update({
        where: { id },
        data,
        select: reservationSelect,
      });

      return toReservationRow(row);
    },

    async readVehicleCommercialStatus(vehicleId: string) {
      const vehicle = await client.vehicle.findUnique({
        where: { id: vehicleId },
        select: { commercialStatus: true },
      });

      return vehicle ? vehicle.commercialStatus : null;
    },

    async setVehicleCommercialStatus(vehicleId: string, status: VehicleCommercialStatus) {
      await client.vehicle.update({
        where: { id: vehicleId },
        data: { commercialStatus: status },
        select: { id: true },
      });
    },

    // Transaction de premier niveau uniquement : le client transactionnel ne relance pas de
    // transaction imbriquée (l'appelant ne compose pas deux `transaction`).
    transaction: (fn) => prisma.$transaction(async (tx) => fn(createReservationRepository(tx))),
  };
}
