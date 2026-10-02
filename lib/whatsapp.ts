/**
 * CTA WhatsApp (BR-120/BR-121/BR-123).
 *
 * Objectifs :
 * - le numéro vient de l'environnement (voir `lib/config/contact.ts`) et n'est **jamais** écrit en dur ;
 * - le lien `https://wa.me/<numéro>?text=<message>` contient au minimum le nom, la référence et le
 *   lien du véhicule (BR-121) ;
 * - le message est une **demande d'information** : il n'est jamais présenté comme un devis ou une
 *   offre ferme (BR-123).
 *
 * Aucune dépendance nouvelle : pur module de fonctions exportées, sans effet de bord.
 */

/** Caractères de mise en forme tolérés dans une saisie humaine (espaces, points, tirets, parenthèses). */
const NUMBER_SEPARATORS = /[\s().\-]/g;
const DIGITS_ONLY = /^\d+$/;

/** Bornes E.164 : 8 à 15 chiffres après l'indicatif, sans zéro initial. */
const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

/**
 * Normalise un numéro WhatsApp saisi librement en E.164 `+<chiffres>`.
 *
 * Accepte les espaces, points, tirets et parenthèses, ainsi que les préfixes internationaux
 * `+` et `00`. Retourne `null` si le numéro est inexploitable (vide, lettres, longueur hors bornes,
 * zéro initial).
 */
export function normalizeWhatsAppNumber(raw: string): string | null {
  const stripped = raw.replace(NUMBER_SEPARATORS, "");

  let digits: string;
  if (stripped.startsWith("+")) {
    digits = stripped.slice(1);
  } else if (stripped.startsWith("00")) {
    digits = stripped.slice(2);
  } else {
    digits = stripped;
  }

  if (!DIGITS_ONLY.test(digits)) {
    return null;
  }

  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) {
    return null;
  }

  if (digits.startsWith("0")) {
    return null;
  }

  return `+${digits}`;
}

export type VehicleWhatsAppMessageInput = {
  title: string;
  reference: string;
  url: string;
  priceLabel?: string | null;
};

/**
 * Construit le message WhatsApp d'une fiche véhicule : nom, référence et lien au minimum.
 * Le libellé reste une demande d'information — aucune mention de devis ou d'offre.
 */
export function buildVehicleWhatsAppMessage(input: VehicleWhatsAppMessageInput): string {
  const lines = [
    "Bonjour Diaba Auto, je souhaite des informations sur ce véhicule :",
    `Véhicule : ${input.title}`,
    `Référence : ${input.reference}`,
  ];

  const priceLabel = input.priceLabel?.trim();
  if (priceLabel) {
    lines.push(`Prix public affiché : ${priceLabel}`);
  }

  lines.push(`Lien : ${input.url}`);

  return lines.join("\n");
}

export type VehicleWhatsAppUrlInput = VehicleWhatsAppMessageInput & {
  whatsappNumber: string;
};

/**
 * Construit l'URL `wa.me` complète. Retourne `null` si le numéro est inexploitable, afin que l'UI
 * masque le CTA plutôt que d'exposer un lien cassé.
 */
export function buildVehicleWhatsAppUrl(input: VehicleWhatsAppUrlInput): string | null {
  const number = normalizeWhatsAppNumber(input.whatsappNumber);
  if (!number) {
    return null;
  }

  const message = buildVehicleWhatsAppMessage(input);
  const digits = number.slice(1);

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}