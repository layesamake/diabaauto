import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import type {
  CustomRequestCreateData,
  CustomRequestRepository,
  CustomRequestRow,
  CustomRequestStatus,
} from "@/services/custom-request.service";

/**
 * Accès Prisma aux demandes sur mesure (`custom_vehicle_requests`, ex-`custom_requests`,
 * contrat lot 4 §2 Sous-agent C ; renommage lot 5 §2.3).
 *
 * Une seule `select` explicite : elle ne contient que les colonnes nécessaires à la projection du
 * service. L'écriture passe exclusivement par ce repository (service_role via Prisma) — la RLS en
 * base n'autorise qu'un SELECT de ses propres lignes pour un client authentifié, aucun INSERT direct
 * côté client (dev.md §6).
 *
 * Périmètre : `custom_vehicle_requests` (table renommée), `create`, `listByCustomer`, ainsi que les
 * lectures/écritures du personnel (`list`, `findById`, `updateStatus`). Le schéma Prisma est la
 * source de vérité (lot 5 §2.3) : le modèle Prisma est `CustomVehicleRequest`.
 */

export const customRequestSelect = {
  id: true,
  customerId: true,
  contactName: true,
  contactPhone: true,
  criteriaJson: true,
  budgetMin: true,
  budgetMax: true,
  status: true,
  createdAt: true,
} as const;

export type CustomRequestDbRow = {
  id: string;
  customerId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  criteriaJson: Prisma.JsonValue;
  budgetMin: Prisma.Decimal | null;
  budgetMax: Prisma.Decimal | null;
  status: CustomRequestStatus;
  createdAt: Date;
};

/** Traduction explicite ligne SQL → contrat du domaine (testable sans base). */
export function toCustomRequestRow(row: CustomRequestDbRow): CustomRequestRow {
  return {
    id: row.id,
    customerId: row.customerId ?? null,
    contactName: row.contactName ?? null,
    contactPhone: row.contactPhone ?? null,
    criteriaJson: isPlainObject(row.criteriaJson) ? (row.criteriaJson as Record<string, unknown>) : {},
    budgetMin: row.budgetMin ? row.budgetMin.toFixed(2) : null,
    budgetMax: row.budgetMax ? row.budgetMax.toFixed(2) : null,
    status: row.status,
    createdAt: row.createdAt,
  };
}

function isPlainObject(value: Prisma.JsonValue): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Sous-ensemble du client Prisma utilisé — permet d'injecter un double en test unitaire. */
export type CustomRequestClient = {
  customVehicleRequest: {
    create(args: {
      data: {
        customerId: string | null;
        contactName: string | null;
        contactPhone: string | null;
        requestedBrand: string | null;
        requestedModel: string | null;
        criteriaJson: Prisma.InputJsonValue;
        budgetMin: string | null;
        budgetMax: string | null;
      };
      select: typeof customRequestSelect;
    }): Promise<CustomRequestDbRow>;
    findMany(args: {
      where: { customerId?: string; status?: CustomRequestStatus };
      select: typeof customRequestSelect;
      orderBy: { createdAt: "desc" };
    }): Promise<CustomRequestDbRow[]>;
    findUnique(args: {
      where: { id: string };
      select: typeof customRequestSelect;
    }): Promise<CustomRequestDbRow | null>;
    update(args: {
      where: { id: string };
      data: { status: CustomRequestStatus };
      select: typeof customRequestSelect;
    }): Promise<CustomRequestDbRow>;
  };
};

export function createCustomRequestRepository(
  client: CustomRequestClient = prisma as unknown as CustomRequestClient,
): CustomRequestRepository {
  return {
    async create(data: CustomRequestCreateData) {
      const row = await client.customVehicleRequest.create({
        data: {
          customerId: data.customerId,
          contactName: data.contactName,
          contactPhone: data.contactPhone,
          requestedBrand: data.requestedBrand,
          requestedModel: data.requestedModel,
          criteriaJson: data.criteriaJson as Prisma.InputJsonValue,
          budgetMin: data.budgetMin,
          budgetMax: data.budgetMax,
        },
        select: customRequestSelect,
      });

      return toCustomRequestRow(row);
    },

    async listByCustomer(customerId: string) {
      const rows = await client.customVehicleRequest.findMany({
        where: { customerId },
        select: customRequestSelect,
        orderBy: { createdAt: "desc" },
      });

      return rows.map(toCustomRequestRow);
    },

    async list(filters) {
      const rows = await client.customVehicleRequest.findMany({
        where: filters?.status ? { status: filters.status } : {},
        select: customRequestSelect,
        orderBy: { createdAt: "desc" },
      });

      return rows.map(toCustomRequestRow);
    },

    async findById(id: string) {
      const row = await client.customVehicleRequest.findUnique({
        where: { id },
        select: customRequestSelect,
      });

      return row ? toCustomRequestRow(row) : null;
    },

    async updateStatus(id: string, status: CustomRequestStatus) {
      const row = await client.customVehicleRequest.update({
        where: { id },
        data: { status },
        select: customRequestSelect,
      });

      return toCustomRequestRow(row);
    },
  };
}
