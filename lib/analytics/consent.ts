/**
 * Consentement à la mesure d'audience (module pur côté logique, stockage navigateur protégé).
 *
 * Le choix est conservé dans le navigateur (`localStorage`) : il ne contient aucune donnée
 * personnelle. Absence de choix = refus : aucune mesure n'est lancée tant que le visiteur n'a pas
 * accepté. Refuser est aussi simple qu'accepter.
 */

export const CONSENT_STORAGE_KEY = "diaba-analytics-consent";
/** Événement fenêtre émis à chaque changement de choix. */
export const CONSENT_CHANGE_EVENT = "diaba:consent-change";
/** Événement fenêtre demandant de rouvrir le bandeau (lien « Gérer les cookies »). */
export const CONSENT_REOPEN_EVENT = "diaba:consent-reopen";

export type ConsentChoice = "granted" | "denied";

export function parseConsent(raw: unknown): ConsentChoice | null {
  return raw === "granted" || raw === "denied" ? raw : null;
}

export function readStoredConsent(): ConsentChoice | null {
  try {
    return parseConsent(window.localStorage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function storeConsent(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {
    // Stockage indisponible : le choix vaut pour la session en cours seulement.
  }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: choice }));
}
