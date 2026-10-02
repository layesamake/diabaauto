import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import type {
  CustomRequestCreateData,
  CustomRequestRepository,
  CustomRequestRow,
  CustomRequestStatus,
} from "@/services/custom-request.service";

/**
 * Accès Prisma aux demandes personnalisées (`custom_requests`, contrat lot 4 §2 Sous-agent C).
 *
 * Une seule `select` explicite : elle ne contient que les colonnes nécessaires à la projection du
 * service. L'écriture passe exclusivement par ce repository (service_role via Prisma) — la RLS en
 * base n'autorise qu'un SELECT de ses propres lignes pour un client authentifié, aucun INSERT direct
 * côté client (dev.md §6).
 *
 * Périmètre : `custom_requests` uniquement, `create` et `listByCustomer` (surface gelée du contrat).
 * Le schéma Prisma n'est jamais modifié ici (T33, déjà posé par l'orchestrateur).
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
  customRequest: {
    create(args: {
      data: {
        customerId: string | null;
        contactName: string | null;
        contactPhone: string | null;
        criteriaJson: Prisma.InputJsonValue;
        budgetMin: string | null;
        budgetMax: string | null;
      };
      select: typeof customRequestSelect;
    }): Promise<CustomRequestDbRow>;
    findMany(args: {
      where: { customerId: string };
      select: typeof customRequestSelect;
      orderBy: { createdAt: "desc" };
    }): Promise<CustomRequestDbRow[]>;
  };
};

export function createCustomRequestRepository(
  client: CustomRequestClient = prisma as unknown as CustomRequestClient,
): CustomRequestRepository {
  return {
    async create(data: CustomRequestCreateData) {
      const row = await client.customRequest.create({
        data: {
          customerId: data.customerId,
          contactName: data.contactName,
          contactPhone: data.contactPhone,
          criteriaJson: data.criteriaJson as Prisma.InputJsonValue,
          budgetMin: data.budgetMin,
          budgetMax: data.budgetMax,
        },
        select: customRequestSelect,
      });

      return toCustomRequestRow(row);
    },

    async listByCustomer(customerId: string) {
      const rows = await client.customRequest.findMany({
        where: { customerId },
        select: customRequestSelect,
        orderBy: { createdAt: "desc" },
      });

      return rows.map(toCustomRequestRow);
    },
  };
}
