# Contrat de lot — Lot 4 « My Diaba Auto, favoris, recherches enregistrées, demandes »

> Lot nommé « lot 4 » par `dev.md` §11. Couvre les trois fonctionnalités que `dev.md` place ensemble à
> cette étape : favoris (visiteur + client), recherches enregistrées, demandes personnalisées
> (`/commander`), ainsi que leur surface dans My Diaba Auto. Décision D30 : favoris non remontés plus
> tôt, ordre de `dev.md` confirmé par l'orchestrateur (aucun arbitrage produit ne l'impose).
>
> Rédigé par l'orchestrateur avant répartition à trois sous-agents travaillant sur des périmètres de
> fichiers **disjoints**. L'intégration finale (branchement dans `app/my-diaba-auto/page.tsx`,
> `VehicleCard.tsx`, `app/(public)/voitures/page.tsx`, navigation, `lib/i18n/index.ts`), la relecture et
> toutes les vérifications sont réalisées par l'orchestrateur après la fin des trois sous-agents —
> comme au lot 3.

## 0. Décisions techniques prises pour ce lot (réversibles, aucun arbitrage produit requis)

- **T33** — `custom_requests` gagne `contact_name` / `contact_phone` (nullable). Nécessaire pour
  respecter dev.md §4/§5 (« une demande personnalisée peut suivre le parcours visiteur [...] conserver
  les coordonnées nécessaires même sans compte ») : le modèle initial ne portait aucune colonne de
  contact hors `customer_id`. Schéma et migration M03 déjà mis à jour par l'orchestrateur avant ce
  contrat. **Ne pas modifier à nouveau `prisma/schema.prisma` ni les migrations `prisma/migrations/`** :
  elles sont hors périmètre des trois sous-agents.
- **T34** — Favoris : les visiteurs utilisent le stockage local (`localStorage`, clé versionnée) ; les
  clients utilisent `favorite_vehicles` (déjà en base depuis M03, RLS déjà posée en M05 — CRUD complet
  de ses lignes). Fusion à la connexion : idempotente via `upsert`/`createMany skipDuplicates` sur
  `(customer_id, vehicle_id)`, puis le stockage local est vidé. La déconnexion ne supprime jamais les
  favoris serveur ; elle efface uniquement les données locales pour ne pas les exposer au prochain
  utilisateur de l'appareil (invariant doc §Favoris).
- **T35** — Recherches enregistrées : `saved_searches.criteria_json` stocke un sous-ensemble sérialisé
  de `CatalogueFilters` (sans `page`/`pageSize`). `notifications_enabled` est accepté et persisté mais
  **aucune notification n'est envoyée** (aucune infrastructure e-mail disponible, D14/D-pending) : le
  libellé d'interface doit dire clairement qu'aucune alerte n'est envoyée pour l'instant.
- **T36** — Demande personnalisée (`/commander`) : accessible sans compte. Validation serveur : nom de
  contact et téléphone **obligatoires** si aucune session client (le canal de rappel est le
  téléphone/WhatsApp, cohérent avec `leads.phone NOT NULL`) ; facultatifs et repris du profil si le
  client est connecté. Nouvelle règle de limitation de fréquence `customRequest` (par défaut 5/heure,
  même mécanisme que `registration`/`recovery`, T08/D07) pour empêcher le spam d'un formulaire public
  sans authentification.
- **T37** — Aucune des trois fonctionnalités n'introduit de nouvelle permission ni de nouvelle route
  back-office : la lecture/gestion des demandes et prospects par le personnel reste hors périmètre de
  ce lot (prévue au lot CRM, `dev.md` §11 point 5).

## 1. Invariants transversaux (rappel, s'appliquent aux trois sous-agents)

- Ordre de contrôle serveur imposé (dev.md §6) : session → statut compte → permission → portée/propriété
  → validation → exécution + audit. Pour favoris/recherches/demandes client, la cible (`customerId`)
  vient **toujours** de l'acteur résolu côté serveur (`getCurrentActor()`), jamais du formulaire ou de
  l'URL.
- Un visiteur n'a par définition pas de `customerId` serveur : les favoris et recherches enregistrées
  d'un visiteur restent **exclusivement côté client** (aucune ligne créée en base tant qu'il n'est pas
  connecté).
- Un compte suspendu (`actor.kind === "suspended"`) est traité comme non authentifié pour toute
  mutation : aucune création/modification de favori, recherche ou demande lui appartenant.
- Enveloppe de réponse unique pour toute Server Action (T11/T13) : `{ data: { message } }` ou
  `{ error: { code, message, correlationId, fields? } }`. Aucun détail interne, aucune valeur saisie
  n'est jamais renvoyée dans un message.
- Validation stricte des entrées (zod `.strict()`), clés inconnues refusées, jamais de repli silencieux.
- Les services ne connaissent ni Prisma ni le nom des tables : ils reçoivent un repository (port),
  exactement comme `services/profile.service.ts` / `services/catalogue.service.ts`. Pas d'appel direct à
  `@/lib/prisma/client` dans un service.
- Tests unitaires sans base (doubles de repository), à l'image de `tests/unit/profile.service.test.ts`.
- Aucune feature n'invente de champ, de promesse commerciale ou de valeur non documentée.
- Palette, i18n (`lib/i18n`), composants `EmptyState`/`DataUnavailable`/`StatusMessage` existants sont
  réutilisés, jamais redupliqués.

## 2. Répartition en trois sous-agents (périmètres de fichiers disjoints)

### Sous-agent A — Favoris (visiteur + client, fusion à la connexion)

**Fichiers à créer :**
- `lib/favorites/local-store.ts` — API client (liste d'UUID de véhicules) dans `localStorage` sous la
  clé `diaba-auto:favorites:v1` ; fonctions pures testables : `readLocalFavorites()`,
  `addLocalFavorite(id)`, `removeLocalFavorite(id)`, `clearLocalFavorites()`,
  `isLocalFavorite(id)`. Tolérant à `localStorage` absent (SSR, navigation privée) : ne jamais lever.
- `repositories/favorite.repository.ts` — Prisma, `favorite_vehicles` uniquement :
  `listByCustomer(customerId)`, `add(customerId, vehicleId)` (idempotent, `upsert`/`createMany
  skipDuplicates`), `remove(customerId, vehicleId)`, `mergeMany(customerId, vehicleIds[])` (idempotent).
- `services/favorite.service.ts` — port `FavoriteRepository`, fonctions `listOwnFavorites(actor)`,
  `addFavorite(actor, vehicleId)`, `removeFavorite(actor, vehicleId)`, `mergeFavoritesOnLogin(actor,
  localVehicleIds[])`. Garde `requireCustomer` (réutiliser `services/access.service.ts`), validation
  UUID stricte, vehicleId jamais multiplié par deux (dédoublonnage avant d'appeler le repository).
- `app/my-diaba-auto/favorites-actions.ts` — Server Actions `"use server"` : `toggleFavoriteAction`,
  `mergeFavoritesAction` (appelée au premier rendu client authentifié). Même enveloppe que
  `app/my-diaba-auto/actions.ts`.
- `components/public/FavoriteButton.tsx` — composant client autonome. Reçoit `vehicleId` et
  `isAuthenticated: boolean` en props (pas d'appel serveur direct au montage) ; lit/écrit le
  `localStorage` si non authentifié, appelle la Server Action si authentifié. **N'est PAS câblé dans
  `VehicleCard.tsx` ni la fiche véhicule par ce sous-agent** — l'orchestrateur l'intègre après coup pour
  éviter un conflit d'édition concurrent sur un fichier partagé.
- `components/profile/FavoritesList.tsx` — liste des favoris du client connecté (section autonome,
  consommée par `app/my-diaba-auto/page.tsx`, câblée par l'orchestrateur).
- `lib/i18n/favorites.fr.ts` — tous les libellés de cette fonctionnalité (ne touche PAS `lib/i18n/fr.ts`
  ni `lib/i18n/index.ts`, qui sont fusionnés par l'orchestrateur).
- `tests/unit/favorite.service.test.ts`, `tests/unit/local-store.test.ts`.

**Hors périmètre de ce sous-agent :** toute modification de `VehicleCard.tsx`,
`app/(public)/voitures/[slug]/page.tsx`, `app/my-diaba-auto/page.tsx`, `lib/i18n/fr.ts`,
`lib/i18n/index.ts`, `prisma/schema.prisma`, les migrations.

### Sous-agent B — Recherches enregistrées

**Fichiers à créer :**
- `repositories/saved-search.repository.ts` — Prisma, `saved_searches` uniquement : `listByCustomer`,
  `create`, `remove` (vérifie l'appartenance avant suppression).
- `services/saved-search.service.ts` — port `SavedSearchRepository`. `listOwnSavedSearches(actor)`,
  `createSavedSearch(actor, input: { name, filters: CatalogueFilters, notificationsEnabled })` (valide
  `name` 1-80 caractères, sérialise uniquement les clés connues de `CatalogueFilters` en retirant
  `page`/`pageSize`), `removeSavedSearch(actor, id)` (garde propriété : `NOT_FOUND` si l'id n'appartient
  pas à l'acteur, jamais `FORBIDDEN`, cf. `services/access.service.ts`).
- `app/my-diaba-auto/saved-searches-actions.ts` — Server Actions `createSavedSearchAction`,
  `removeSavedSearchAction`, même enveloppe T11/T13.
- `components/public/SaveSearchButton.tsx` — bouton client autonome recevant les filtres courants
  (`CatalogueFilters`) et `isAuthenticated: boolean` en props ; masqué/désactivé avec message explicite
  si non authentifié (pas de sauvegarde anonyme : BR non prévu, aucune donnée visiteur en base). **N'est
  PAS câblé dans `app/(public)/voitures/page.tsx`** — intégration par l'orchestrateur.
- `components/profile/SavedSearchesList.tsx` — liste des recherches du client (section autonome pour
  `app/my-diaba-auto/page.tsx`, lien `/voitures?<criteria_json reconstitué>` vers chaque recherche).
- `lib/i18n/saved-searches.fr.ts` — libellés dédiés (même règle que le sous-agent A : pas de
  modification de `lib/i18n/fr.ts`/`index.ts`).
- `tests/unit/saved-search.service.test.ts`.

**Hors périmètre :** `app/(public)/voitures/page.tsx`, `components/public/CatalogueFilterForm.tsx`,
`app/my-diaba-auto/page.tsx`, `lib/i18n/fr.ts`, `lib/i18n/index.ts`, schéma/migrations.

### Sous-agent C — Demande personnalisée (`/commander`) et son suivi dans My Diaba Auto

**Fichiers à créer/remplacer (le stub actuel de `/commander` est entièrement remplacé) :**
- `repositories/custom-request.repository.ts` — Prisma, `custom_requests` uniquement : `create`,
  `listByCustomer(customerId)`. Les colonnes `contact_name`/`contact_phone` existent déjà sur le modèle
  (T33) : ne pas toucher au schéma.
- `services/custom-request.service.ts` — port `CustomRequestRepository`. Schéma zod `.strict()` :
  `criteria` (marque/modèle texte libre ou ids facettes réutilisables, budget min/max optionnels avec
  `budgetMin <= budgetMax`), `contactName`/`contactPhone` **obligatoires si `actor.kind !== "customer"`**,
  ignorés (repris du profil serveur) si client connecté — jamais de confiance dans un
  `contactName`/`contactPhone` envoyé par un client déjà identifié. `submitCustomRequest(actor, input)`
  et `listOwnCustomRequests(actor)` (garde `requireCustomer`, `NOT_FOUND` hors propriétaire).
- `app/(public)/commander/actions.ts` — Server Action `submitCustomRequestAction`, limitation de
  fréquence nouvelle règle `customRequest` (ajoutée dans `services/rate-limit.service.ts` ET
  `lib/env.ts` — ce sont les deux SEULS fichiers partagés que ce sous-agent peut modifier, en
  **ajout pur**, jamais en retrait d'une règle existante).
- `app/(public)/commander/page.tsx` — remplace le stub. Formulaire complet : accessible sans session,
  pré-rempli si client connecté (lecture seule des coordonnées issues du profil, pas de champ modifiable
  redondant avec My Diaba Auto), confirmation claire que la demande **ne vaut ni réservation ni
  commande** (dev.md §1).
- `components/public/CustomRequestForm.tsx` — formulaire client, même mécanique que
  `components/auth/RegisterForm.tsx` (état `pending`, enveloppe d'erreur, pas de soumission native).
- `components/profile/CustomRequestsList.tsx` — liste des demandes du client (section autonome pour
  `app/my-diaba-auto/page.tsx`).
- `lib/i18n/custom-request.fr.ts` — libellés dédiés (même règle : pas de `lib/i18n/fr.ts`/`index.ts`).
- `tests/unit/custom-request.service.test.ts`.

**Hors périmètre :** `app/my-diaba-auto/page.tsx`, `lib/i18n/fr.ts`, `lib/i18n/index.ts`,
`prisma/schema.prisma`, les migrations. Modifications de `services/rate-limit.service.ts` et
`lib/env.ts` strictement additives (nouvelle règle `customRequest`, aucune règle existante modifiée).

## 3. Intégration finale (orchestrateur, après la fin des trois sous-agents)

1. Fusionner `lib/i18n/favorites.fr.ts`, `saved-searches.fr.ts`, `custom-request.fr.ts` dans
   `lib/i18n/fr.ts`/`index.ts` (ou les exposer en espaces de noms distincts si la fusion introduit un
   conflit de clé).
2. Câbler `FavoriteButton` dans `VehicleCard.tsx` et `app/(public)/voitures/[slug]/page.tsx`.
3. Câbler `SaveSearchButton` dans `app/(public)/voitures/page.tsx` (à côté de `CatalogueFilterForm`).
4. Ajouter les trois sections (`FavoritesList`, `SavedSearchesList`, `CustomRequestsList`) dans
   `app/my-diaba-auto/page.tsx`, dans le bloc `CustomerDashboard`.
5. Appeler `mergeFavoritesAction` une fois après connexion (effet client dans le tableau de bord ou la
   page de connexion — à trancher par l'orchestrateur selon ce qui reste le plus simple et testable).
6. Vérifications complètes : `tsc --noEmit`, `eslint .`, `vitest run`, `npm run build`,
   `node scripts/verify-migrations.mjs`, sondage des routes construites (`next start` + `curl`), comme au
   lot 3.
7. Mettre à jour `docs/decisions.md` (T33-T37 déjà rédigées ci-dessus à recopier) et produire
   `docs/rapport-lot-4.md` sur le modèle de `docs/rapport-lot-3.md`.
