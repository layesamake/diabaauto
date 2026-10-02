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

// Lot 6 — « Mes commandes » (My Diaba Auto) : espace de noms distinct (même décision d'intégration
// que le lot 4 — chaque module reste la source unique de ses libellés).
export { ordersFr, type OrdersMessages } from "./orders.fr";
export { staffOrdersFr, type StaffOrdersMessages } from "./staff-orders.fr";

// Back-office — « Mon compte » (sécurité de l'accès du personnel) : espace de noms distinct.
export { accountFr, type AccountMessages } from "./account.fr";

// Lot 7 — « Personnel » (gestion des comptes internes) : espace de noms distinct.
export { staffAccountsFr, type StaffAccountsMessages } from "./staff-accounts.fr";