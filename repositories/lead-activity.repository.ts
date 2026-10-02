import { prisma } from "@/lib/prisma/client";
import type { LeadActivityCreateData, LeadActivityRepository } from "@/services/lead.service";

/**
 * Accès Prisma à l'historique d'activités des prospects (`lead_activities`, doc 03 §11,
 * contrat lot 5 §2.2).
 *
 * Historique réservé au personnel (aucun privilège client en base). Les activités sont listées de la
 * plus récente à la plus ancienne, conformément à l'index `(lead_id, created_at)`.
 */

/** Colonnes strictement nécessaires à la projection `LeadActivityView`. */
export const leadActivitySelect = {
  id: true,
  type: true,
  description: true,
  performedBy: true,
  createdAt: true,
} as const;

export type LeadActivityDbRow = {
  id: string;
  type: LeadActivityCreateData["type"];
  description: string;
  performedBy: string | null;
  createdAt: Date;
};

export function createLeadActivityRepository(client = prisma): LeadActivityRepository {
  return {
    async listByLead(leadId: string) {
      const rows = await client.leadActivity.findMany({
        where: { leadId },
        select: leadActivitySelect,
        orderBy: { createdAt: "desc" },
      });

      return rows.map((row) => ({
        id: row.id,
        type: row.type,
        description: row.description,
        performedBy: row.performedBy ?? null,
        createdAt: row.createdAt,
      }));
    },

    async create(data: LeadActivityCreateData) {
      const row = await client.leadActivity.create({
        data: {
          leadId: data.leadId,
          type: data.type,
          description: data.description,
          performedBy: data.performedBy,
        },
        select: { id: true },
      });

      return { id: row.id };
    },
  };
}
