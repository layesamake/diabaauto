import { prisma } from "@/lib/prisma/client";
import { createAuditWriter } from "@/repositories/audit.repository";
import type { SitePageSlug } from "@/lib/site-pages/site-pages";
import type { AuditLogEntry } from "@/services/audit.service";

/**
 * Pages de contenu (`site_pages`, une ligne par page — migration M12).
 *
 * Colonnes explicitement sélectionnées. L'écriture et son audit partagent UNE transaction.
 */

export type StoredSitePage = { slug: string; title: string; body: string; updatedAt: Date };

export type SitePageRepository = {
  read(slug: SitePageSlug): Promise<StoredSitePage | null>;
  readAll(): Promise<StoredSitePage[]>;
  save(
    page: { slug: SitePageSlug; title: string; body: string },
    buildAudit: (before: StoredSitePage | null, after: StoredSitePage) => AuditLogEntry,
  ): Promise<StoredSitePage>;
};

const select = { slug: true, title: true, body: true, updatedAt: true } as const;

export function createSitePageRepository(): SitePageRepository {
  return {
    async read(slug) {
      return prisma.sitePage.findUnique({ where: { slug }, select });
    },

    async readAll() {
      return prisma.sitePage.findMany({ select });
    },

    async save(page, buildAudit) {
      return prisma.$transaction(async (tx) => {
        const before = await tx.sitePage.findUnique({ where: { slug: page.slug }, select });
        const saved = await tx.sitePage.upsert({
          where: { slug: page.slug },
          create: page,
          update: { title: page.title, body: page.body },
          select,
        });

        await createAuditWriter(tx)(buildAudit(before, saved));

        return saved;
      });
    },
  };
}
