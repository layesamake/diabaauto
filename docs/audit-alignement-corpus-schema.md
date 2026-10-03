# Audit d'alignement — corpus documentaire canonique vs dépôt Diaba Auto

> Date : 2026-09-28. Dépôt : `/opt/data/projects/diabacar` (commit de référence : `34c8b73`).
> Sources : `docs/03_Modele_de_donnees_SOURCE.docx`, `docs/12_Schema_Prisma_final_propose.docx`,
> `docs/07_Roles_et_permissions.docx`, `docs/17_Cahier_securite.docx`, `CLAUDE.md` §7 et §11.
> Objet implémenté : `prisma/schema.prisma` (317 lignes), `prisma/migrations/M01→M05`, `services/`, `repositories/`, `tests/`.

## 1. Méthode

Extraction du texte des 21 `.docx` (paragraphes `word/document.xml`), reconstruction des blocs
`model` / `enum` du doc 12, puis comparaison programmatique des modèles, champs, enums et
conventions avec `prisma/schema.prisma`, les migrations SQL et les services.

## 2. Constat structurant : deux générations du corpus

Le lot 2 a été développé contre le **jeu de documents alors présent dans `docs/`** (16 `.docx`
renommés `01…16`), supprimé au profit du jeu canonique. Comparaison des deux jeux, côté données :

| Élément | Ancien jeu (référence du lot 2 livré) | Jeu canonique (référence actuelle) |
| --- | --- | --- |
| Doc de schéma | `07_Schema_Prisma_de_Reference.docx` — **18 modèles, 10 enums** | `12_Schema_Prisma_final_propose.docx` — **37 modèles, 17 enums** |
| Conventions de colonnes | camelCase (`userType`, `firstName`) sauf `auth_user_id` | snake_case **sur tous les champs** (`@map("user_type")`, `@map("first_name")`, …) |
| Statut de compte | `AccountStatus` = `ACTIVE \| SUSPENDED` | `ProfileStatus` = `ACTIVE \| SUSPENDED \| DISABLED` |
| Statut Revendeur | `ResellerStatus` = `NONE \| PENDING \| APPROVED \| REJECTED \| SUSPENDED` | idem avec `NOT_APPLICABLE` au lieu de `NONE` |
| Modèle de données | absent du jeu | `03_Modele_de_donnees_SOURCE.docx` (doc « faisant foi ») |
| PRD, architecture, specs UX | absents | présents (docs 01, 02, 04, 05) |
| Permissions | `02_Roles_et_Permissions.docx` listait **exactement les 26 codes implémentés** | `07_Roles_et_permissions.docx` liste **une autre liste**, groupée par module (§4) |

**Conséquence** : `prisma/schema.prisma` — et donc les migrations M01→M05, les services,
le seed et les tests du lot 2 — sont **fidèles à l'ancienne génération**, pas au corpus canonique.
Le constat « E01 : aucun écart de structure » de `docs/decisions.md` (§Annexe) était exact
*contre l'ancien jeu* ; il est **caduc contre le jeu canonique**. Aucune faute d'exécution n'est
en cause : c'est le corpus de référence qui a changé sous le code.

## 3. Écarts par rapport au corpus canonique

Légende : `D` = divergence de référentiel (à trancher) — `C` = à corriger dans le code existant —
`P` = périmètre d'un lot futur, à modéliser avant de coder.

### 3.1 Convention de nommage et d'enums (D)

| # | Écart | Source canonique | Dépôt | Impact |
| --- | --- | --- | --- | --- |
| A01 | Colonnes en camelCase (`profiles."userType"`, `customer_profiles."firstName"`, `roles."code"`…) au lieu de snake_case `@map` partout | Doc 12 (chaque champ) | `prisma/schema.prisma` : seuls les `@@map` de tables et `authUserId → auth_user_id` sont mappés | Toute requête SQL manuelle, policy RLS ou script écrit selon le corpus ne s'applique pas telle quelle ; incohérence interne déjà visible (M05 mélange `auth_user_id` et `"userType"`) |
| A02 | `AccountStatus` au lieu de `ProfileStatus`, sans `DISABLED` | Doc 12 | `schema.prisma:16` | Un compte désactivé distinct du suspendu n'est pas représentable |
| A03 | `ResellerStatus.NONE` au lieu de `NOT_APPLICABLE` | Doc 12 | `schema.prisma:21` | Aucun fonctionnel ; écart de vocabulaire |
| A04 | `VehicleStatus` (`DRAFT/REVIEW/PUBLISHED/RESERVED/SOLD/WITHDRAWN`) au lieu de `VehicleCommercialStatus` (`DRAFT/AVAILABLE/RESERVED/SOLD/UNAVAILABLE/ARCHIVED`) | Doc 12, doc 03 §6.1 | `schema.prisma:29` | Le référentiel distingue `commercial_status` de `is_published` ; le dépôt confond les deux — la fiche ne peut pas être « disponible mais non publiée » |
| A05 | `VehicleLocation` sans `IN_TRANSIT` | Doc 12, doc 03 §6.1 | `schema.prisma:43` | Un véhicule en transit Chine→Sénégal n'est pas représentable, alors que c'est le cœur du parcours Diaba Auto |
| A06 | `AssetVisibility` (`PUBLIC/PRIVATE`) au lieu de `DocumentVisibility` (`PUBLIC/PRIVATE/SHARE_ON_REQUEST`) | Doc 12, doc 03 §7 | `schema.prisma:74` | Le partage sur demande d'un document d'inspection n'est pas modélisable |
| A07 | `LeadStatus` = `NEW/QUALIFIED/FOLLOW_UP/CONVERTED/LOST` | Doc 12 : `NEW/CONTACTED/QUALIFIED/NEGOTIATION/ORDER_CONFIRMED/LOST/COMPLETED` | `schema.prisma:48` | Aucun état de pipeline CRM canonique n'est représentable (perte de `NEGOTIATION`, `ORDER_CONFIRMED`) |
| A08 | `OrderStatus` = `CREATED/CONFIRMED/PROCESSING/SHIPPING/DELIVERED/CANCELLED` | Doc 12 : `CONFIRMED/PROCESSING/IN_TRANSIT/ARRIVED/DELIVERED/CANCELLED` | `schema.prisma:65` | Suivi logistique import (`IN_TRANSIT`, `ARRIVED`) absent |
| A09 | Tables/modèles renommés : `favorites` (`favorite_vehicles`), `saved_searches.filtersJson` (`criteria_json`), `VehicleImage` (`vehicle_media`), `CustomRequest` (`custom_vehicle_requests`) | Doc 03 §7, §10, §11 | `schema.prisma:224,240,201,263` | Frictions de correspondance avec le corpus et les specs API (doc 10) |

### 3.2 Écarts relevant du périmètre déjà livré (C)

| # | Écart | Source canonique | Dépôt | Impact |
| --- | --- | --- | --- | --- |
| C01 | `Profile.preferredLocale` absent | Doc 03 §3, doc 12 | `schema.prisma:79` | Langue d'affichage du client non stockée alors que le corpus la déclare |
| C02 | `CustomerProfile` : `pricing_profile` et `customer_segment` absents ; `company_name`, `business_type` absents ; `phone`/`whatsapp` nullables ; `country` sans défaut `SN` ; pas d'`updatedAt` | Doc 03 §3, doc 12 | `schema.prisma:92` | La règle du doc 07 §5 (« tarif Revendeur exige `pricing_profile = RESELLER` **et** `reseller_status = APPROVED` ») n'est pas exprimable : `services/pricing.service.ts` ne teste que `resellerStatus === "APPROVED"`. Les champs d'une demande Revendeur n'ont pas de support |
| C03 | Rôle du personnel : `StaffProfile.roleId` **1:N** au lieu de `staff_roles` **N:N** ; pas de `firstName`/`lastName`/`phone`/`jobTitle` ; `active` hors référentiel | Doc 12 (`StaffRole`, `staff_profiles`) | `schema.prisma:111`, migration M01 | Le modèle d'autorisation du corpus est N:N ; l'implémentation interdit le cumul de rôles et invente un champ `active` |
| C04 | `Role.description` et `Permission.name`, `Permission.module` absents | Doc 03 §3, doc 07 §4, doc 12 | `schema.prisma:122,131` ; M01 | Le corpus range les permissions par module (Vehicle, Customer, CRM, Order, Catalog, System) : la granularité back-office n'a pas de support, alors que le doc 12 la déclare |
| C05 | `AuditLog` : `entity`/`entityId`/`beforeJson`/`afterJson`/`occurredAt` au lieu de `entity_type`/`entity_id`/`old_values`/`new_values`/`created_at` ; `ip_address` et `user_agent` absents ; relation non nommée | Doc 12 | `schema.prisma:305` ; M04 | Le doc 17 §8 exige l'immutabilité (livrée) et une journalisation opposable ; les champs `ip_address`/`user_agent` du corpus ne sont pas capturés |
| C06 | Permissions : les 26 codes implémentés (`vehicle.price_edit`, `lead.update`, `order.update`, `reseller.reject`, `content.manage`, `storage.private_read`) ne recouvrent pas la liste du corpus (`vehicle.archive`, `vehicle.view_costs`, `reseller.review`, `lead.create`, `lead.edit`, `lead.close`, `order.status_change`, `order.cancel`, `taxonomy.*`, `feature.manage`, `import_rules.manage`, `fx.manage`) | Doc 07 §4 | `prisma/seed-data.ts`, `services/permissions.service.ts` | D01 (matrice) et la liste de droits doivent être rearbitrées : le corpus est plus fin que l'implémentation |
| C07 | Enums SQL créés sans le préfixe de schéma/`CREATE TYPE ... "ProfileStatus"` du corpus | Doc 12 | migration M01 | Découle de A02–A08 |

### 3.3 Périmètre des prochains lots — non modélisé (P)

Le corpus canonique décrit des pans entiers absents du schéma. Ils doivent être **modélisés avant
d'être codés**, sinon le lot catalogue reproduira la divergence :

- **Référentiels** (doc 03 §5) : `generations`, `trims`, `body_types`, `fuel_types`, `transmission_types`, `colors`, `option_categories`, `options`, `feature_definitions` — le dépôt n'a que `Brand` et `VehicleModel`, et `Vehicle.fuel`/`transmission` en chaîne libre (`CLAUDE.md` §7 et le doc 03 exigent des listes administrables : écart E13/D11 confirmé par le corpus canonique).
- **Véhicule** (doc 03 §6) : une trentaine de champs absents (génération, finition, carrosserie, énergie/boîte en FK, puissance, portes, places, couleurs, `source_type`, `supplier_*`, `featured`, `eligibility_*`, `archived_at`, `deleted_at`), plus l'invariant `reference = DBC-YYYY-NNNNNN` (aucune `CHECK` de format) et la règle « prix **ou** mode sur demande » que `publicPrice` obligatoire interdit.
- **Médias** (doc 03 §7) : `vehicle_media` avec `media_type IMAGE/VIDEO`, `thumbnail_path`, `external_video_url`, `category`, `display_order`.
- **Pricing** (doc 03 §9) : `vehicle_prices` (`pricing_profile`, `price_type REGULAR/PROMOTIONAL`, `base_amount` **et `transport_amount` séparés**, `valid_from`/`valid_to`, `is_active`), `exchange_rates`, `price_history`. Le dépôt stocke `publicPrice`/`resellerPrice`/`currency` sur `Vehicle` : **D10 est tranché par le corpus canonique** (table dédiée), ce qui rend `services/pricing.service.ts` et la migration M02 provisoires.
- **CRM / commerce** (doc 03 §11, doc 12) : `lead_notes`, `lead_activities`, `reseller_applications`, `reservations`, `import_eligibility_rules`, `vehicle_eligibility`, `vehicle_logistics_events`, `deposits`.
- **CMS / système** (doc 03 §12) : `pages`, `page_translations`, `settings`, `analytics_events`.

## 4. Ce qui reste conforme, quel que soit le référentiel

- Ordre et découpage des migrations M01→M05, outil unique (T01/T02/T07).
- Trigger `auth.users` idempotent, réparation des comptes orphelins (T03).
- RLS activée sur 18 tables avec 25 policies en refus par défaut, buckets Storage versionnés (E04/E11 corrigés).
- `audit_logs` append-only (`REVOKE` + trigger) — exigence doc 17 §8 respectée (T05).
- `CHECK` de montants, index partiels et index de FK (T04/T06).
- Ordre de contrôle serveur, refus neutre `NOT_FOUND` pour les ressources privées, enveloppe d'erreur unique (T11/T12/T13).
- Anti-dérive de la matrice de droits par test (T15) — mécanisme à conserver, contenu à réarbitrer (C06).
- Vérifié après ce changement : `npx tsc --noEmit` OK, `npx eslint .` OK, `npx vitest run` **14 fichiers / 88 tests verts**, `node scripts/verify-migrations.mjs` **ÉCART = 0**.

## 5. Décision requise — TRANCHÉE : option A

Deux trajectoires, non équivalentes en coût :

- **Option A — réaligner le dépôt sur le corpus canonique.** Renommer les colonnes en snake_case
  (`@map`) partout, renommer/adapter les 10 enums, ajouter `preferred_locale`, `pricing_profile`,
  `customer_segment`, `Role.description`, `Permission.name/module`, `StaffRole`, `AuditLog.ip_address`/
  `user_agent`, puis régénérer M01→M05 (les migrations ne sont **appliquées nulle part** : aucune base
  n'existe, donc aucun coût de migration de données). Impact : réécriture de `schema.prisma`, M01–M05,
  policies RLS, services, seed, tests. Aucune donnée à migrer.
- **Option B — conserver le schéma livré et traiter le corpus canonique comme cible des lots suivants.**
  Écrire alors formellement que les noms d'enums et de colonnes du dépôt prévalent, et reprendre les
  divergences au lot catalogue. Impact : le dépôt reste à vie décalé du corpus sur le nommage et les
  enums (A01–A08), et chaque nouveau lot devra retraduire le vocabulaire documentaire.

Aucune des deux n'est engagée par le code : les migrations n'ont jamais été appliquées (`docs/rapport-lot-2.md` §4, D15).

## 6. Recommandation

**Option A, en une seule passe, avant tout développement du lot catalogue.** Raisons : aucune base
n'existe donc le renommage est purement mécanique et vérifiable par tests ; le corpus canonique est
déclaré « faisant foi » (doc 03, avertissement d'autorité) et devient la source des specs UX/API ;
le coût croît linéairement avec le nombre de tables écrites, et le lot catalogue ajouterait une
trentaine de tables à réaligner ensuite.

Séquence proposée :

1. Trancher A ou B (arbitrage Diaba Auto — question produit, pas technique).
2. Si A : réécrire `schema.prisma` depuis le doc 12 (§annexe) sur le périmètre identité + audit, régénérer M01→M05, réappliquer `scripts/verify-migrations.mjs`, réexécuter la suite.
3. Réarbitrer D01 (matrice rôle → permission) sur la liste du doc 07 §4, et C06 en conséquence.
4. Trancher les questions désormais sourçables : D10 (tranché par doc 03 §9), D11, D12 (définitions de caractéristiques : doc 03 §5 et §8), D13 (`deleted_at` : doc 03 §6), D17 (**levée** : le modèle de données source existe — `docs/03_Modele_de_donnees_SOURCE.docx`).
5. Modéliser le périmètre catalogue (§3.3) **avant** d'écrire les services du lot suivant.

## 7. Réalisation (option A) — 2026-09-28

Décision Diaba Auto : **option A**, appliquée immédiatement, avant tout développement du lot catalogue.

### 7.1 Ce qui a été fait

- `prisma/schema.prisma` réécrit : snake_case (`@map`) sur **chaque** champ, 12 enums canoniques,
  `staff_roles` N:N, `profiles.preferred_locale`, `customer_profiles.pricing_profile` /
  `customer_segment` / `company_name` / `business_type` / `country` / horodatages,
  `staff_profiles` prénom/nom/poste (plus de champ `active`), `roles.description`,
  `permissions.name` / `module`, `audit_logs.entity_type` / `old_values` / `new_values` /
  `ip_address` / `user_agent` / `created_at`, `vehicles.is_published`, tables `favorite_vehicles`
  (clé composite) et `vehicle_media`, `saved_searches.criteria_json`.
- Migrations **régénérées** : `ÉCART = 0` entre le schéma et M01..M04 ; 12 enums, 19 tables,
  133 colonnes, 23 index, 22 clés étrangères ; **163 instructions** dont 76 générées par
  `prisma migrate diff`. M05 : RLS sur 19 tables, 25 policies, 3 fonctions `SECURITY DEFINER`,
  trigger `auth.users`, 4 buckets Storage.
- **Correction de sécurité trouvée pendant la revue** (T16) : `vehicles` n'est plus exposé par un
  `GRANT SELECT` global — le privilège est accordé colonne par colonne, `reseller_price` **exclu**.
  RLS filtre des lignes, pas des colonnes : sans cela, une lecture PostgREST directe aurait exposé
  le tarif Revendeur à un visiteur (contradiction avec doc 07 §3 et doc 17 §1). Contrôlé désormais
  par `scripts/verify-migrations.mjs`.
- Code adapté : statut de compte `ProfileStatus` (un statut ≠ `ACTIVE` reste non authentifié),
  rôles N:N avec union dédupliquée des permissions (un membre sans rôle n'a aucun droit),
  transitions de statut commercial canoniques, audit aux noms canoniques avec `entityId` nullable,
  seed avec `name`/`module`/`description`, `staff:grant` par `staff_roles`.
- Vérifié après réalignement : `npx prisma validate` OK, `npx tsc --noEmit` OK, `npx eslint .` OK,
  `npx vitest run` **14 fichiers / 92 tests verts**, `node scripts/verify-migrations.mjs`
  **ÉCART = 0** (code de sortie 0).

### 7.2 Écarts d'alignement refermés

A01–A09 (nommage et enums) → **refermés**. C01–C05, C07 (identité, RBAC, audit) → **refermés**.
C06 (liste des permissions) → **ouvert, décision D21** : les 26 codes restent provisoirement en place,
désormais chacun rattaché à son module canonique.
`RequestStatus` reste hors corpus (écart rédactionnel E28) et `custom_requests` reste un modèle
provisoire à remodeler au lot catalogue.

### 7.3 Ce qui reste ouvert (aucune reprise de données : les migrations n'ont jamais été appliquées)

| # | Reste à faire | Décision |
| --- | --- | --- |
| 1 | `vehicle_prices` + `exchange_rates` + `price_history` (transport séparé, périodes de validité) | D10 tranché, exécution au lot catalogue |
| 2 | Référentiels administrables (énergies, boîtes, carrosseries, générations, finitions, couleurs, options, caractéristiques) | D11, D12 |
| 3 | Champs véhicule du doc 03 §6 (~30), médias étendus (type/vidéo/vignette), `reference = DBC-YYYY-NNNNNN`, `deleted_at` | D13 + lot catalogue |
| 4 | CRM/logistique/CMS (`lead_notes`, `lead_activities`, `reseller_applications`, `reservations`, éligibilité import, `pages`, `settings`, `analytics_events`) | lot catalogue |
| 5 | Liste des permissions du corpus (doc 07 §4) et matrice rôle → permission | D01, D21 |
| 6 | `phone` / `whatsapp` obligatoires sur `customer_profiles` | D22 (nullables en attendant) |
| 7 | Retrait/révocation de rôle et cycle d'habilitation | D03, D23 |
| 8 | Application réelle des migrations et tests RLS par identité | D15 (aucune base disponible) |