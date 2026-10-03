import { AppError } from "@/lib/errors";
import { SITE_PAGES, SITE_PAGE_SLUGS, isSitePageSlug, parseSitePageInput, type SitePageSlug } from "@/lib/site-pages/site-pages";
import { createSitePageRepository, type SitePageRepository } from "@/repositories/site-page.repository";
import { requireStaff } from "@/services/access.service";
import { buildAuditEntry } from "@/services/audit.service";
import type { Actor } from "@/services/identity.service";

/**
 * Pages de contenu éditables depuis le back-office.
 *
 * Permission `content.manage`, vérifiée ICI. Le texte est revalidé côté serveur quelle que soit sa
 * source. Chaque enregistrement produit une entrée `content.change` : le journal garde le titre
 * avant/après et la taille du texte, pas le texte entier.
 */

let repository: SitePageRepository = createSitePageRepository();

export function configureSitePageRepository(next: SitePageRepository): void {
  repository = next;
}

export function resetSitePageRepository(): void {
  repository = createSitePageRepository();
}

export type SitePageEditView = {
  slug: SitePageSlug;
  label: string;
  publicPath: string;
  title: string;
  body: string;
  /** `false` : aucune version enregistrée, le texte par défaut est affiché. */
  customized: boolean;
  updatedAt: Date | null;
};

function toView(slug: SitePageSlug, stored: { title: string; body: string; updatedAt: Date } | null): SitePageEditView {
  const definition = SITE_PAGES[slug];

  return {
    slug,
    label: definition.label,
    publicPath: definition.publicPath,
    title: stored?.title ?? definition.defaultTitle,
    body: stored?.body ?? definition.defaultBody,
    customized: stored !== null,
    updatedAt: stored?.updatedAt ?? null,
  };
}

export async function listSitePages(actor: Actor): Promise<SitePageEditView[]> {
  requireStaff(actor, "content.manage");

  const stored = new Map((await repository.readAll()).map((page) => [page.slug, page]));

  return SITE_PAGE_SLUGS.map((slug) => toView(slug, stored.get(slug) ?? null));
}

export async function getSitePageForEdit(actor: Actor, slug: unknown): Promise<SitePageEditView> {
  requireStaff(actor, "content.manage");

  if (!isSitePageSlug(slug)) {
    throw new AppError("NOT_FOUND", "Page introuvable.");
  }

  return toView(slug, await repository.read(slug));
}

export async function updateSitePage(actor: Actor, input: unknown): Promise<SitePageEditView> {
  const staff = requireStaff(actor, "content.manage");

  const parsed = parseSitePageInput(input);
  if (!parsed.ok) {
    throw new AppError("VALIDATION", "Le titre et le texte de la page sont obligatoires.");
  }

  const { slug, title, body } = parsed.value;
  const saved = await repository.save({ slug, title, body }, (before, after) =>
    buildAuditEntry({
      actorProfileId: staff.profileId,
      action: "content.change",
      entityType: "SitePage",
      entityId: slug,
      oldValues: { title: before?.title ?? SITE_PAGES[slug].defaultTitle, bodyLength: before?.body.length ?? null },
      newValues: { title: after.title, bodyLength: after.body.length },
    }),
  );

  return toView(slug, saved);
}
