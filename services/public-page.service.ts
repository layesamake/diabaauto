import { unstable_cache } from "next/cache";
import { SITE_PAGES, type SitePageSlug } from "@/lib/site-pages/site-pages";
import { createSitePageRepository } from "@/repositories/site-page.repository";

/**
 * Pages de contenu lues pour le site public.
 *
 * Le contenu ne dépend d'aucun utilisateur : le cache partagé est sûr. Il est invalidé à chaque
 * enregistrement (`sitePageTag`), avec une expiration de secours. Toute erreur de lecture (table M12
 * absente, base indisponible) retombe sur le texte par défaut ; l'erreur est interceptée HORS du
 * cache pour ne pas être mémorisée.
 */

export const sitePageTag = (slug: SitePageSlug) => `site-page-${slug}`;

export type PublicPage = { title: string; body: string };

function readCached(slug: SitePageSlug) {
  return unstable_cache(
    async () => {
      const page = await createSitePageRepository().read(slug);
      return page ? { title: page.title, body: page.body } : null;
    },
    ["site-page", slug],
    { tags: [sitePageTag(slug)], revalidate: 300 },
  )();
}

export async function getPublicPage(slug: SitePageSlug): Promise<PublicPage> {
  try {
    const stored = await readCached(slug);
    if (stored) {
      return stored;
    }
  } catch {
    // Retombe sur le texte par défaut.
  }

  const definition = SITE_PAGES[slug];
  return { title: definition.defaultTitle, body: definition.defaultBody };
}
