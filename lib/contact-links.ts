/**
 * Liens de contact construits à partir des coordonnées enregistrées (module pur).
 *
 * Une valeur inexploitable donne `null` : la page affiche alors le texte sans lien, jamais un lien cassé.
 */

/** `https://wa.me/<chiffres>` depuis un numéro E.164 ; `null` si le numéro n'est pas exploitable. */
export function whatsAppChatUrl(whatsappNumber: string): string | null {
  const match = /^\+([1-9][0-9]{7,14})$/.exec(whatsappNumber.trim());
  return match ? `https://wa.me/${match[1]}` : null;
}

/** `tel:` depuis une saisie libre (espaces, points, tirets, parenthèses tolérés) ; `null` sous 6 chiffres. */
export function telUrl(phone: string): string | null {
  const compact = phone.replace(/[\s().\-]/g, "");
  if (!/^\+?[0-9]{6,15}$/.test(compact)) {
    return null;
  }
  return `tel:${compact}`;
}

/** `mailto:` pour une adresse de forme valide ; `null` sinon. */
export function mailtoUrl(email: string): string | null {
  const value = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? `mailto:${value}` : null;
}

/** Adresse postale affichable : les parties renseignées, séparées par des virgules. */
export function formatPostalAddress(parts: {
  contactAddress: string | null;
  contactCity: string | null;
  contactCountry: string | null;
}): string | null {
  const kept = [parts.contactAddress, parts.contactCity, parts.contactCountry]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0);
  return kept.length > 0 ? kept.join(", ") : null;
}
