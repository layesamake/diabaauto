import { prisma } from "@/lib/prisma/client";
import type { StoredContact } from "@/lib/config/contact";
import type { AuditLogEntry } from "@/services/audit.service";
import { createAuditWriter } from "@/repositories/audit.repository";

/**
 * Réglages du site (`site_settings`, une seule ligne `id = 1` — migration M11).
 *
 * Colonnes explicitement sélectionnées. L'écriture et son audit partagent UNE transaction : un
 * réglage ne change jamais sans trace, et une trace n'existe jamais sans changement.
 */

export type SiteSettingsRepository = {
  read(): Promise<StoredContact | null>;
  /** Écrit les valeurs ; `buildAudit` reçoit l'état avant/après et son entrée est enregistrée dans la même transaction. */
  save(
    next: StoredContact,
    buildAudit: (before: StoredContact, after: StoredContact) => AuditLogEntry | null,
  ): Promise<StoredContact>;
};

const select = {
  whatsappNumber: true,
  contactPhone: true,
  contactEmail: true,
  contactAddress: true,
  contactCity: true,
  contactCountry: true,
} as const;

const EMPTY: StoredContact = {
  whatsappNumber: null,
  contactPhone: null,
  contactEmail: null,
  contactAddress: null,
  contactCity: null,
  contactCountry: null,
};

export function createSiteSettingsRepository(): SiteSettingsRepository {
  return {
    async read() {
      return prisma.siteSettings.findUnique({ where: { id: 1 }, select });
    },

    async save(next, buildAudit) {
      return prisma.$transaction(async (tx) => {
        const before = (await tx.siteSettings.findUnique({ where: { id: 1 }, select })) ?? EMPTY;
        const saved = await tx.siteSettings.upsert({
          where: { id: 1 },
          create: { id: 1, ...next },
          update: next,
          select,
        });

        const entry = buildAudit(before, saved);
        if (entry) {
          await createAuditWriter(tx)(entry);
        }

        return saved;
      });
    },
  };
}
