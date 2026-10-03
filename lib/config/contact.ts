/**
 * Configuration de contact Diaba Auto (BR-120/BR-121/BR-123).
 *
 * Le numéro WhatsApp est lu depuis l'environnement et n'est jamais écrit en dur dans un composant.
 * `DEFAULT_WHATSAPP_NUMBER` est la valeur initiale documentée au doc 08 (BR-120) ; elle est à
 * confirmer par l'exploitant (voir `.env.example`). Seuls des NOMS de variables sont manipulés :
 * aucune valeur d'environnement n'est journalisée ni affichée.
 *
 * Style des autres modules de configuration (`lib/env.ts`, `lib/storage/vehicle-storage.ts`) :
 * source injectable (par défaut `process.env`) pour rester testable sans charger l'environnement réel.
 */

/** Valeur par défaut documentée (BR-120, doc 08), à confirmer par l'exploitant. */
export const DEFAULT_WHATSAPP_NUMBER = "+221782254040";

/** Noms des variables d'environnement lues (jamais leurs valeurs). */
export const CONTACT_ENV_KEYS = {
  whatsappNumber: "NEXT_PUBLIC_WHATSAPP_NUMBER",
  contactPhone: "NEXT_PUBLIC_CONTACT_PHONE",
  contactCountry: "NEXT_PUBLIC_CONTACT_COUNTRY",
} as const;

export type ContactConfig = {
  /** Numéro WhatsApp en E.164 sans espaces, ex. `+221782254040`. */
  whatsappNumber: string;
  /** Téléphone de contact public, `null` si non renseigné. */
  contactPhone: string | null;
  /** Pays de contact, `null` si non renseigné. */
  contactCountry: string | null;
};

/** Normalise une valeur optionnelle : chaîne vide ou espaces = non renseigné. */
function readOptionalValue(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value ? value : null;
}

/**
 * Lit la configuration de contact. Le numéro WhatsApp retombe sur `DEFAULT_WHATSAPP_NUMBER` quand la
 * variable est absente ou vide ; les espaces de séparation sont retirés pour garantir la forme E.164.
 */
export function readContactConfig(source: Record<string, string | undefined> = process.env): ContactConfig {
  const whatsappNumber =
    readOptionalValue(source[CONTACT_ENV_KEYS.whatsappNumber])?.replace(/\s+/g, "") ?? DEFAULT_WHATSAPP_NUMBER;

  return {
    whatsappNumber,
    contactPhone: readOptionalValue(source[CONTACT_ENV_KEYS.contactPhone]),
    contactCountry: readOptionalValue(source[CONTACT_ENV_KEYS.contactCountry]),
  };
}

/**
 * Coordonnées enregistrées depuis le back-office (table `site_settings`). `null` = non renseignée :
 * la valeur retombe alors sur l'environnement, puis, pour le WhatsApp seulement, sur la valeur documentée.
 */
export type StoredContact = {
  whatsappNumber: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactAddress: string | null;
  contactCity: string | null;
  contactCountry: string | null;
};

export type PublicContact = {
  whatsappNumber: string;
  contactPhone: string | null;
  contactEmail: string | null;
  contactAddress: string | null;
  contactCity: string | null;
  contactCountry: string | null;
};

/**
 * Coordonnées publiques : la valeur saisie au back-office prime, l'environnement vient ensuite.
 * `stored` peut être `null` (table absente ou illisible) : le site fonctionne alors comme avant M11.
 */
export function resolveContact(
  stored: StoredContact | null,
  source: Record<string, string | undefined> = process.env,
): PublicContact {
  const env = readContactConfig(source);
  const clean = (value: string | null | undefined) => readOptionalValue(value ?? undefined);

  return {
    whatsappNumber: clean(stored?.whatsappNumber)?.replace(/\s+/g, "") ?? env.whatsappNumber,
    contactPhone: clean(stored?.contactPhone) ?? env.contactPhone,
    contactEmail: clean(stored?.contactEmail),
    contactAddress: clean(stored?.contactAddress),
    contactCity: clean(stored?.contactCity),
    contactCountry: clean(stored?.contactCountry) ?? env.contactCountry,
  };
}
