import { z } from "zod";

/**
 * Validation des coordonnées de contact (module pur, importable par un test en environnement `node`).
 *
 * Les erreurs ne portent que des NOMS de champs, jamais la valeur saisie. Le numéro WhatsApp est
 * normalisé (espaces, points, tirets et parenthèses retirés) puis doit être au format E.164 : le
 * lien `wa.me` est construit depuis cette valeur, une valeur mal formée produirait un lien cassé.
 * Un champ vide efface la valeur (`null`) : le site retombe sur l'environnement.
 */

export const SITE_SETTINGS_FIELDS = [
  "whatsappNumber",
  "contactPhone",
  "contactEmail",
  "contactAddress",
  "contactCity",
  "contactCountry",
] as const;

export type SiteSettingsField = (typeof SITE_SETTINGS_FIELDS)[number];

export type SiteSettingsValues = Record<SiteSettingsField, string | null>;

const E164 = /^\+[1-9][0-9]{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable();

const schema = z
  .object({
    whatsappNumber: z
      .string()
      .transform((value) => value.replace(/[\s.\-()]/g, ""))
      .refine((value) => value === "" || E164.test(value))
      .transform((value) => (value === "" ? null : value))
      .nullable(),
    contactPhone: optional(40),
    contactEmail: z
      .string()
      .trim()
      .max(254)
      .refine((value) => value === "" || EMAIL.test(value))
      .transform((value) => (value === "" ? null : value))
      .nullable(),
    contactAddress: optional(200),
    contactCity: optional(80),
    contactCountry: optional(80),
  })
  .strict();

export type SiteSettingsParse =
  | { ok: true; value: SiteSettingsValues }
  | { ok: false; fields: SiteSettingsField[] };

/** Valide un objet brut ; toute clé inconnue est refusée (`strict`). */
export function parseSiteSettings(raw: unknown): SiteSettingsParse {
  const result = schema.safeParse(raw);
  if (result.success) {
    return { ok: true, value: result.data as SiteSettingsValues };
  }

  const fields = new Set<SiteSettingsField>();
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && (SITE_SETTINGS_FIELDS as readonly string[]).includes(key)) {
      fields.add(key as SiteSettingsField);
    }
  }

  return { ok: false, fields: [...fields] };
}

/** Lit UNIQUEMENT les champs connus du formulaire : un champ privilégié envoyé en plus n'est jamais lu. */
export function readSiteSettingsForm(formData: FormData): Record<SiteSettingsField, string> {
  const read = (name: SiteSettingsField) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  return Object.fromEntries(SITE_SETTINGS_FIELDS.map((name) => [name, read(name)])) as Record<
    SiteSettingsField,
    string
  >;
}
