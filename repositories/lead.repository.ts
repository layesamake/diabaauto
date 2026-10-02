import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import type { LeadFilters, LeadRepository, LeadRow } from "@/services/lead.service";

/**
 * Accès Prisma aux prospects (`leads`, doc 03 §11, contrat lot 5 §2.1).
 *
 * Une seule `select` explicite : elle ne contient que les colonnes nécessaires à la projection du
 * service (`LeadRow`). Le modèle Prisma est la source de vérité ; le champ `name` remplace
 * `first_name` (lot 5 §2.1). Les montants `DECIMAL` sont rendus en chaînes à deux décimales, comme
 * `repositories/custom-request.repository.ts`, pour ne jamais laisser fuiter un `Decimal` vers
 * l'interface.
 *
 * Aucune donnée prospect n'est exposée hors personnel : la RLS en base n'accorde aucun privilège
 * client sur `leads` ; l'écriture passe exclusivement par ce repository (service_role via Prisma).
 */

/** Colonnes strictement nécessaires à la projection `LeadRow`. */
export const leadSelect = {
  id: true,
  reference: true,
  name: true,
  phone: true,
  whatsapp: true,
  email: true,
  source: true,
  customerId: true,
  vehicleId: true,
  budgetMin: true,
  budgetMax: true,
  assignedSalespersonId: true,
  nextFollowUpAt: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Ligne telle que retournée par Prisma (avant traduction en contrat du domaine). */
export type LeadDbRow = {
  id: string;
  reference: string;
  name: string;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  source: string | null;
  customerId: string | null;
  vehicleId: string | null;
  budgetMin: Prisma.Decimal | null;
  budgetMax: Prisma.Decimal | null;
  assignedSalespersonId: string | null;
  nextFollowUpAt: Date | null;
  status: LeadRow["status"];
  createdAt: Date;
  updatedAt: Date;
};

/** Traduction explicite ligne SQL → contrat du domaine (testable sans base). */
export function toLeadRow(row: LeadDbRow): LeadRow {
  return {
    id: row.id,
    reference: row.reference,
    name: row.name,
    phone: row.phone,
    whatsapp: row.whatsapp ?? null,
    email: row.email ?? null,
    source: row.source ?? null,
    customerId: row.customerId ?? null,
    vehicleId: row.vehicleId ?? null,
    budgetMin: row.budgetMin ? row.budgetMin.toFixed(2) : null,
    budgetMax: row.budgetMax ? row.budgetMax.toFixed(2) : null,
    assignedSalespersonId: row.assignedSalespersonId ?? null,
    nextFollowUpAt: row.nextFollowUpAt ?? null,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Construit le filtre `where` borné de la liste des prospects. */
export function toLeadWhere(filters: LeadFilters = {}): Prisma.LeadWhereInput {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.assignedSalespersonId
      ? { assignedSalespersonId: filters.assignedSalespersonId }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" as const } },
            { phone: { contains: filters.search, mode: "insensitive" as const } },
            { reference: { contains: filters.search, mode: "insensitive" as const } },
            { email: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

export function createLeadRepository(client: Prisma.TransactionClient = prisma): LeadRepository {
  return {
    async list(filters: LeadFilters) {
      const rows = await client.lead.findMany({
        where: toLeadWhere(filters),
        select: leadSelect,
        orderBy: { createdAt: "desc" },
      });

      return rows.map(toLeadRow);
    },

    async findById(id: string) {
      const row = await client.lead.findUnique({ where: { id }, select: leadSelect });
      return row ? toLeadRow(row) : null;
    },

    async updateStatus(id: string, status: LeadRow["status"]) {
      const row = await client.lead.update({
        where: { id },
        data: { status },
        select: leadSelect,
      });

      return toLeadRow(row);
    },

    async assign(id: string, staffId: string | null) {
      const row = await client.lead.update({
        where: { id },
        data: { assignedSalespersonId: staffId },
        select: leadSelect,
      });

      return toLeadRow(row);
    },
  };
}
