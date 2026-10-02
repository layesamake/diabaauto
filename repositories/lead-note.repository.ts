import { prisma } from "@/lib/prisma/client";
import type { LeadNoteCreateData, LeadNoteRepository } from "@/services/lead.service";

/**
 * Accès Prisma au journal privé des prospects (`lead_notes`, doc 03 §11, contrat lot 5 §2.2).
 *
 * Journal strictement privé : aucun privilège client en base (RLS), lecture/écriture réservées au
 * personnel. Les notes sont listées de la plus récente à la plus ancienne, conformément à l'index
 * `(lead_id, created_at)`.
 */

/** Colonnes strictement nécessaires à la projection `LeadNoteView`. */
export const leadNoteSelect = {
  id: true,
  content: true,
  authorId: true,
  createdAt: true,
} as const;

export type LeadNoteDbRow = {
  id: string;
  content: string;
  authorId: string;
  createdAt: Date;
};

export function createLeadNoteRepository(client = prisma): LeadNoteRepository {
  return {
    async listByLead(leadId: string) {
      const rows = await client.leadNote.findMany({
        where: { leadId },
        select: leadNoteSelect,
        orderBy: { createdAt: "desc" },
      });

      return rows.map((row) => ({
        id: row.id,
        content: row.content,
        authorId: row.authorId,
        createdAt: row.createdAt,
      }));
    },

    async create(data: LeadNoteCreateData) {
      const row = await client.leadNote.create({
        data: {
          leadId: data.leadId,
          authorId: data.authorId,
          content: data.content,
        },
        select: { id: true },
      });

      return { id: row.id };
    },
  };
}
