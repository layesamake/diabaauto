import type { MetadataRoute } from "next";
import { publicRoutes } from "@/lib/routes";
import { absoluteUrl } from "@/lib/seo";
import { listPublishedSlugs } from "@/services/catalogue.service";

/**
 * sitemap.xml généré par Next (lot 3, enfant C).
 *
 * Contenu : pages publiques de `lib/routes.ts` + toutes les fiches véhicule publiées
 * (`/voitures/<slug>`). Les véhicules non publiés, archivés ou `SOLD` sont déjà exclus par le
 * service de catalogue (`listPublishedSlugs` ne retourne que les fiches réellement indexables).
 *
 * Tolérance à l'absence de base de données : la lecture des slugs est encapsulée — en cas d'échec,
 * le sitemap se réduit aux pages statiques sans faire échouer le build.
 */

type StaticPageSettings = {
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
};

const STATIC_PAGE_SETTINGS: Record<string, StaticPageSettings> = {
  "/": { changeFrequency: "daily", priority: 1 },
  "/voitures": { changeFrequency: "daily", priority: 0.9 },
  "/commander": { changeFrequency: "monthly", priority: 0.6 },
  "/comment-ca-marche": { changeFrequency: "monthly", priority: 0.5 },
  "/a-propos": { changeFrequency: "monthly", priority: 0.4 },
  "/contact": { changeFrequency: "monthly", priority: 0.5 },
};

const DEFAULT_STATIC_PAGE_SETTINGS: StaticPageSettings = { changeFrequency: "monthly", priority: 0.5 };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = publicRoutes.map((route) => {
    const settings = STATIC_PAGE_SETTINGS[route] ?? DEFAULT_STATIC_PAGE_SETTINGS;

    return {
      url: absoluteUrl(route),
      changeFrequency: settings.changeFrequency,
      priority: settings.priority,
    };
  });

  try {
    const slugs = await listPublishedSlugs();

    for (const { slug, publishedAt } of slugs) {
      entries.push({
        url: absoluteUrl(`/voitures/${slug}`),
        lastModified: publishedAt ?? undefined,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  } catch {
    // Base de données indisponible : on conserve les pages statiques (build non bloquant).
  }

  return entries;
}