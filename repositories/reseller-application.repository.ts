import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import type {
  ResellerApplicationCreateData,
  ResellerApplicationFilters,
  ResellerApplicationRepository,
  ResellerApplicationReviewValues,
  ResellerApplicationRow,
} from "@/services/reseller-application.service";

/**
 * Accès Prisma aux demandes Revendeur (`reseller_applications`, doc 03 §4, contrat lot 5 §2.2).
 *
 * Une seule `select` explicite vers la projection `ResellerApplicationRow`. La colonne scalaire
 * `reviewed_by` (modèle `reviewedById`) est exposée au service sous le nom `reviewedBy`, sans jamais
 * laisser fuiter le modèle Prisma complet.
 *
 * L'approbation est transactionnelle : `transaction(fn)` ouvre **une** transaction Prisma et fournit
 * à `fn` un repository lié au client transactionnel, afin que la mise à jour de la demande,
 * l'effet sur `customer_profiles` et l'audit soient atomiques. `approveResellerCustomer` écrit
 * `pricing_profile = RESELLER` et `reseller_status = APPROVED` sur le client ciblé.
 */

/** Colonnes strictement nécessaires à la projection `ResellerApplicationRow`. */
export const resellerApplicationSelect = {
  id: true,
  customerId: true,
  companyName: true,
  businessType: true,
  estimatedVolume: true,
  status: true,
  reviewedById: true,
  reviewedAt: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type ResellerApplicationDbRow = {
  id: string;
  customerId: string;
  companyName: string;
  businessType: string | null;
  estimatedVolume: string | null;
  status: ResellerApplicationRow["status"];
  reviewedById: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** États d'une demande « ouverte » (invariant corpus : une seule par client). */
const OPEN_STATUSES: readonly ResellerApplicationRow["status"][] = ["PENDING", "UNDER_REVIEW"];

/** Traduction explicite ligne SQL → contrat du domaine (testable sans base). */
export function toResellerApplicationRow(row: ResellerApplicationDbRow): ResellerApplicationRow {
  return {
    id: row.id,
    customerId: row.customerId,
    companyName: row.companyName,
    businessType: row.businessType ?? null,
    estimatedVolume: row.estimatedVolume ?? null,
    status: row.status,
    reviewedBy: row.reviewedById ?? null,
    reviewedAt: row.reviewedAt ?? null,
    rejectionReason: row.rejectionReason ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createResellerApplicationRepository(
  client: Prisma.TransactionClient = prisma,
): ResellerApplicationRepository {
  return {
    async findOpenByCustomer(customerId: string) {
      const row = await client.resellerApplication.findFirst({
        where: { customerId, status: { in: [...OPEN_STATUSES] } },
        select: resellerApplicationSelect,
        orderBy: { createdAt: "desc" },
      });

      return row ? toResellerApplicationRow(row) : null;
    },

    async create(data: ResellerApplicationCreateData) {
      const row = await client.resellerApplication.create({
        data: {
          customerId: data.customerId,
          companyName: data.companyName,
          businessType: data.businessType,
          estimatedVolume: data.estimatedVolume,
          status: data.status,
        },
        select: resellerApplicationSelect,
      });

      return toResellerApplicationRow(row);
    },

    async list(filters: ResellerApplicationFilters) {
      const rows = await client.resellerApplication.findMany({
        where: filters?.status ? { status: filters.status } : {},
        select: resellerApplicationSelect,
        orderBy: { createdAt: "desc" },
      });

      return rows.map(toResellerApplicationRow);
    },

    async findById(id: string) {
      const row = await client.resellerApplication.findUnique({
        where: { id },
        select: resellerApplicationSelect,
      });

      return row ? toResellerApplicationRow(row) : null;
    },

    async updateReview(id: string, values: ResellerApplicationReviewValues) {
      const row = await client.resellerApplication.update({
        where: { id },
        data: {
          status: values.status,
          reviewedById: values.reviewedBy,
          reviewedAt: values.reviewedAt,
          rejectionReason: values.rejectionReason,
        },
        select: resellerApplicationSelect,
      });

      return toResellerApplicationRow(row);
    },

    async approveResellerCustomer(customerId: string) {
      await client.customerProfile.update({
        where: { id: customerId },
        data: { pricingProfile: "RESELLER", resellerStatus: "APPROVED" },
        select: { id: true },
      });
    },

    // Une seule transaction de premier niveau : le client transactionnel ne relance pas de
    // transaction imbriquée (l'appelant ne compose pas deux `transaction`).
    transaction: (fn) => prisma.$transaction(async (tx) => fn(createResellerApplicationRepository(tx))),
  };
}
