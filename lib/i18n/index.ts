/**
 * Point d'entrée i18n de l'interface publique (BR-143, contrat lot 3 §3.9).
 *
 * Le français est la seule langue livrée dans ce lot : les composants importent `fr` (et les
 * fonctions de formatage) depuis `@/lib/i18n`. EN/AR et le routage de langue restent hors lot.
 */
export {
  fr,
  formatAmount,
  formatMileage,
  formatPublishedDate,
  formatResultCount,
  type Messages,
} from "./fr";

// Lot 4 — favoris, recherches enregistrées, demande personnalisée : espaces de noms distincts
// (décision d'intégration, contrat lot 4 §3.1 — pas de fusion dans `fr` pour éviter tout conflit de
// clé entre les trois sous-agents ; chaque module reste la source unique de ses propres libellés).
export { favoritesFr, type FavoritesMessages } from "./favorites.fr";
export { savedSearchesFr, type SavedSearchesMessages } from "./saved-searches.fr";
export { customRequestMessages, type CustomRequestMessages } from "./custom-request.fr";