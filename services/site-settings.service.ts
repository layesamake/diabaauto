import { AppError } from "@/lib/errors";
import type { StoredContact } from "@/lib/config/contact";
import {
  SITE_SETTINGS_FIELDS,
  parseSiteSettings,
} from "@/lib/site-settings/site-settings-schema";
import {
  createSiteSettingsRepository,
  type SiteSettingsRepository,
} from "@/repositories/site-settings.repository";
import { requireStaff } from "@/services/access.service";
import { buildAuditEntry } from "@/services/audit.service";
import type { Actor } from "@/services/identity.service";

/**
 * Coordonnées de contact modifiables depuis le back-office.
 *
 * Permission unique `settings.manage` (ADMIN), vérifiée ICI et non à l'écran. La valeur est
 * revalidée côté serveur quelle que soit la source ; un enregistrement identique à l'état courant
 * n'écrit ni ne journalise rien. Chaque changement réel produit une entrée `settings.change`
 * (numéros masqués par l'assainissement de l'audit).
 */

let repository: SiteSettingsRepository = createSiteSettingsRepository();

export function configureSiteSettingsRepository(next: SiteSettingsRepository): void {
  repository = next;
}

export function resetSiteSettingsRepository(): void {
  repository = createSiteSettingsRepository();
}

const EMPTY: StoredContact = {
  whatsappNumber: null,
  contactPhone: null,
  contactEmail: null,
  contactAddress: null,
  contactCity: null,
  contactCountry: null,
};

export async function getSiteSettings(actor: Actor): Promise<StoredContact> {
  requireStaff(actor, "settings.manage");

  return (await repository.read()) ?? EMPTY;
}

export async function updateSiteSettings(actor: Actor, input: unknown): Promise<StoredContact> {
  const staff = requireStaff(actor, "settings.manage");

  const parsed = parseSiteSettings(input);
  if (!parsed.ok) {
    throw new AppError("VALIDATION", "Certaines coordonnées ne sont pas valides.");
  }

  return repository.save(parsed.value, (before, after) => {
    const changed = SITE_SETTINGS_FIELDS.filter((field) => before[field] !== after[field]);
    if (changed.length === 0) {
      return null;
    }

    return buildAuditEntry({
      actorProfileId: staff.profileId,
      action: "settings.change",
      entityType: "site_settings",
      entityId: "1",
      oldValues: Object.fromEntries(changed.map((field) => [field, before[field]])),
      newValues: Object.fromEntries(changed.map((field) => [field, after[field]])),
    });
  });
}
