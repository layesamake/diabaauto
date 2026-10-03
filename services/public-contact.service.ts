import { unstable_cache } from "next/cache";
import { resolveContact, type PublicContact, type StoredContact } from "@/lib/config/contact";
import { createSiteSettingsRepository } from "@/repositories/site-settings.repository";

/**
 * Coordonnées publiques, lues pour le site.
 *
 * Elles ne dépendent d'aucun utilisateur : le cache partagé est sûr. Il est invalidé par le
 * back-office (`SITE_CONTACT_TAG`) dès qu'un réglage change, avec une expiration de secours.
 * Toute erreur de lecture (table M11 pas encore appliquée, base indisponible) retombe sur
 * l'environnement : une fiche véhicule ne doit jamais échouer à cause d'un réglage. L'erreur est
 * interceptée HORS du cache pour que l'échec ne soit pas mémorisé.
 */

export const SITE_CONTACT_TAG = "site-contact";

const readStored = unstable_cache(
  async (): Promise<StoredContact | null> => createSiteSettingsRepository().read(),
  ["site-contact"],
  { tags: [SITE_CONTACT_TAG], revalidate: 300 },
);

export async function getPublicContact(): Promise<PublicContact> {
  let stored: StoredContact | null = null;
  try {
    stored = await readStored();
  } catch {
    stored = null;
  }

  return resolveContact(stored);
}
