/**
 * Configuration de la mesure d'audience (Google Analytics 4).
 *
 * Module pur : la source d'environnement est injectée. La mesure n'est active que si les TROIS
 * variables sont cohérentes (`NEXT_PUBLIC_ANALYTICS_ENABLED=true`, fournisseur GA4, identifiant de
 * mesure bien formé) ; sinon rien n'est chargé, aucun bandeau n'est affiché et la CSP n'autorise
 * aucune origine Google. Seuls des NOMS de variables sont manipulés ici.
 */

export const ANALYTICS_ENV_KEYS = {
  enabled: "NEXT_PUBLIC_ANALYTICS_ENABLED",
  provider: "NEXT_PUBLIC_ANALYTICS_PROVIDER",
  id: "NEXT_PUBLIC_ANALYTICS_ID",
} as const;

const GA4_PROVIDERS = ["ga4", "google-analytics"] as const;
const MEASUREMENT_ID = /^G-[A-Z0-9]{4,20}$/;

/** Identifiant de mesure GA4 si la mesure est correctement configurée, sinon `null`. */
export function readAnalyticsMeasurementId(
  source: Record<string, string | undefined> = process.env,
): string | null {
  if (source[ANALYTICS_ENV_KEYS.enabled]?.trim().toLowerCase() !== "true") {
    return null;
  }

  const provider = source[ANALYTICS_ENV_KEYS.provider]?.trim().toLowerCase() ?? "";
  if (!(GA4_PROVIDERS as readonly string[]).includes(provider)) {
    return null;
  }

  const id = source[ANALYTICS_ENV_KEYS.id]?.trim() ?? "";
  return MEASUREMENT_ID.test(id) ? id : null;
}
