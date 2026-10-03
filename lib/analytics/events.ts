/**
 * Événements de mesure (plan Analytics, CLAUDE.md §9).
 *
 * Liste FERMÉE : un événement ou un paramètre absent d'ici n'est jamais envoyé. Aucun texte libre
 * (message, e-mail, téléphone, termes de recherche) ne peut partir : seuls des paramètres nommés,
 * de type simple et de longueur bornée sont acceptés.
 *
 * Un clic de contact n'est PAS une conversion : `contact_whatsapp_click` mesure une intention ;
 * `request_submitted` n'est émis qu'après la confirmation du serveur.
 */

export const ANALYTICS_EVENT_PARAMS = {
  /** Recherche ou filtrage du catalogue : seulement s'il y a un texte et quels filtres, jamais le texte. */
  catalogue_search: ["has_query", "filters"],
  vehicle_view: ["vehicle_reference", "location"],
  favorite_add: ["vehicle_id"],
  contact_whatsapp_click: ["vehicle_reference"],
  /** Demande personnalisée enregistrée par le serveur. */
  request_submitted: [],
} as const satisfies Record<string, readonly string[]>;

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENT_PARAMS;

export type AnalyticsParamValue = string | number | boolean;

const MAX_STRING_LENGTH = 100;

/**
 * Charge utile autorisée pour un événement : clés hors liste écartées, valeurs non primitives
 * écartées, chaînes tronquées. Retourne `null` pour un événement inconnu.
 */
export function buildEventPayload(
  name: string,
  params: Record<string, unknown> = {},
): Record<string, AnalyticsParamValue> | null {
  if (!Object.prototype.hasOwnProperty.call(ANALYTICS_EVENT_PARAMS, name)) {
    return null;
  }

  const allowed = ANALYTICS_EVENT_PARAMS[name as AnalyticsEventName] as readonly string[];
  const payload: Record<string, AnalyticsParamValue> = {};

  for (const key of allowed) {
    const value = params[key];
    if (typeof value === "string") {
      payload[key] = value.slice(0, MAX_STRING_LENGTH);
    } else if (typeof value === "number" || typeof value === "boolean") {
      payload[key] = value;
    }
  }

  return payload;
}

type Gtag = (command: "event", name: string, params: Record<string, AnalyticsParamValue>) => void;

/** Envoie l'événement si, et seulement si, la mesure est active (consentement donné). Sans effet sinon. */
export function trackEvent(name: AnalyticsEventName, params: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") {
    return;
  }

  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag !== "function") {
    return;
  }

  const payload = buildEventPayload(name, params);
  if (payload) {
    gtag("event", name, payload);
  }
}
