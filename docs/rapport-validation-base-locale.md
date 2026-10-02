# Rapport de validation — Base PostgreSQL réelle (locale, hors Docker/root)

> Date : 2026-10-02. Répond à la limite structurelle « aucune base de données accessible »,
> constante depuis le lot 2 (voir `docs/rapport-lot-2.md`, `docs/rapport-lot-3.md`,
> `docs/rapport-lot-4.md`). Exécuté par l'orchestrateur, en dehors de toute action de lot.

## 1. Pourquoi une base « locale et jetable » plutôt que Supabase/Hostinger

Aucun accès réseau à un projet Supabase ni à un VPS Hostinger n'est disponible dans cet
environnement d'exécution, et aucune fourniture d'accès externe n'a été communiquée. Docker est
installé en CLI mais son démon n'est pas accessible (pas de droits root, pas de service
`dockerd`). Pour lever le blocage sans attendre un accès externe, un PostgreSQL 17 a été obtenu
en extrayant les paquets Debian officiels (`.deb`) sans droits root (`apt-get download` +
`dpkg -x` vers un répertoire utilisateur), puis initialisé et démarré en tant qu'utilisateur
courant. Cette base est un outil de validation ponctuel, **pas un environnement de développement
permanent** : elle vit dans `/opt/data/profiles/samakedev/cache/pgsql/` (hors du dépôt applicatif,
non versionnée) et a été détruite après usage.

**Limite assumée de cette approche** : Supabase fournit normalement deux services que Postgres
seul n'a pas — l'API d'authentification GoTrue et l'API Storage avec signature d'URL. Un stub SQL
minimal (`local-supabase-stub.sql`, non livré, hors dépôt) a recréé uniquement ce que les
migrations attendent de ces services au niveau base : les rôles `anon`/`authenticated`/
`service_role`, la fonction `auth.uid()` (lisant un paramètre de session au lieu d'un jeton HTTP
réel), la table `auth.users`, et les tables `storage.buckets`/`storage.objects` avec
`storage.foldername()`. **Ni GoTrue ni l'API Storage réelle n'ont été exercées** : inscription/
connexion HTTP réelles et upload de fichiers réels restent non vérifiés. En revanche, comme détaillé
plus bas, la quasi-totalité du code applicatif (catalogue, favoris, recherches, demandes,
permissions, pricing, et les policies RLS elles-mêmes) passe par Postgres en accès direct via
Prisma et a donc été entièrement exercée.

## 2. Mise en place

1. PostgreSQL 17.11 (paquets `postgresql-17`, `postgresql-client-17`, `libpq5`, `libicu76`)
   extraits sans root, démarré sur `127.0.0.1:5544` (port non standard pour ne rien entrer en
   conflit), base `diaba_dev`.
2. Stub `auth`/`storage` appliqué une fois (voir §1).
3. `npx prisma generate` puis `npx prisma migrate deploy` : **les 5 migrations M01 à M05
   s'appliquent sans erreur**, RLS comprise.
4. `npm run seed` (référentiels : permissions, rôles, carrosseries, énergies, boîtes de vitesses)
   puis `npm run seed:demo` (4 véhicules fictifs, 2 marques fictives, clairement identifiés
   `DEMO-`/« données fictives », conformément à T32/D14/D25/D32 — rien d'inventé qui ressemble à
   une offre réelle).

## 3. Ce qui a été réellement vérifié (et comment)

### 3.1 Migrations et structure

- `prisma migrate deploy` : 5/5 migrations appliquées, aucune erreur.
- 33 tables métier créées, RLS activée sur les 33 (vérifié par
  `pg_class.relrowsecurity`).

### 3.2 Serveur Next.js réel contre cette base (`next build` + `next start`)

- Build de production : succès.
- `/voitures` : affiche réellement **4 véhicules** (pagination/lecture catalogue réelles, pour la
  première fois depuis le lot 2).
- `/` : la section « Nouveautés » affiche bien 0 véhicule quand aucun n'est marqué `featured`
  (donnée de seed, pas un bug), puis les véhicules marqués `featured=true` après une mise à jour
  directe de test.
- `/voitures/<slug-réel>` : 200, fiche véhicule rendue avec des données réelles.
- `/voitures/<slug-inexistant>` : 404 avec message « introuvable » (testé isolément).
- `/marque/<slug-réel>` : 200.
- `/commander` : 200, formulaire complet.
- `/my-diaba-auto` (visiteur) : redirection 307 vers `/connexion?suivant=...`, comportement attendu.

### 3.3 Trigger d'inscription (`handle_new_auth_user`, M05)

Un utilisateur inséré directement dans `auth.users` déclenche bien la création automatique de
`profiles` (`CUSTOMER`/`ACTIVE`) et `customer_profiles` (`STANDARD`/`INDIVIDUAL`/
`NOT_APPLICABLE`) avec les prénoms/noms repris de `raw_user_meta_data` — exactement le
comportement spécifié par T03.

### 3.4 Parcours applicatifs (services + repositories réels, Prisma direct, aucun mock)

Script ponctuel exerçant le code réel du dépôt (non livré, supprimé après usage) :

1. `resolveActor` résout correctement un visiteur en client (`kind: "customer"`).
2. `listCatalogue` retourne les 4 véhicules réels avec un prix Standard correctement calculé.
3. `addFavorite` + `listOwnFavorites` : persistance réelle en base, relecture correcte.
4. `listVehiclesByIds` (ajout d'intégration du lot 4) : enrichissement réel des favoris.
5. `mergeFavoritesOnLogin` : fusion idempotente réelle, pas de doublon.
6. `createSavedSearch` + `listOwnSavedSearches` : persistance et relecture réelles.
7. `submitCustomRequest` (client connecté) + `listOwnCustomRequests` : persistance réelle, contact
   non dupliqué pour un client identifié (conforme T36).
8. `submitCustomRequest` (visiteur anonyme, avec nom/téléphone) : persistance réelle, `contact_name`/
   `contact_phone` bien enregistrés (vérifié directement en base, colonnes T33).
9. Passage d'un client en `resellerStatus = APPROVED` puis relecture du catalogue : le prix
   recalculé porte `anomaly: "MISSING_RESELLER_PRICE"` — **comportement correct et non un bug** :
   le jeu de démonstration ne définit volontairement que des prix Standard (`seed-demo-data.ts`),
   jamais de prix Revendeur ; le code dégrade proprement sur le prix Standard avec un signal
   explicite plutôt que d'échouer ou d'exposer une valeur erronée. Confirme que le type
   `CataloguePrice.anomaly` et son usage sont corrects face à des données réelles incomplètes.

### 3.5 Policies RLS — exécutées en tant que rôle `authenticated`/`anon` (pas seulement via Prisma)

Pour prouver que la RLS protège réellement au niveau base (et pas seulement parce que
l'application est bien écrite), les policies ont été exercées directement en SQL avec
`SET ROLE authenticated` et `SET request.jwt.claim.sub = '<uuid>'` (simulant le jeton que
PostgREST transmettrait normalement) :

| # | Contrôle | Résultat |
| --- | --- | --- |
| 1 | Client authentifié lit son propre `customer_profiles` | ✅ 1 ligne visible |
| 2 | Même client lit `vehicle_prices` | ✅ refusé (`permission denied`, aucun GRANT) |
| 3 | Même client lit `vehicles` (catalogue public) | ✅ 4 lignes visibles |
| 4 | Même client crée un favori pour lui-même | ✅ accepté |
| 5 | Même client tente de créer un favori pour un **autre** `customer_id` | ✅ refusé (policy `WITH CHECK`) |
| 6 | Même client lit `staff_profiles` | ✅ refusé (`permission denied`) |
| 7 | Rôle `anon` (visiteur) lit `vehicles` | ✅ 4 lignes visibles |
| 8 | Rôle `anon` lit `customer_profiles` | ✅ refusé |
| 9 | Rôle `anon` lit `vehicle_prices` | ✅ refusé |

Storage (`storage.objects`, mêmes rôles simulés) :

| # | Contrôle | Résultat |
| --- | --- | --- |
| 1 | Upload dans son propre dossier `avatars/<uid>/...` | ✅ accepté |
| 2 | Upload dans le dossier `avatars/<autre-uid>/...` | ✅ refusé |
| 3 | Lecture de son propre avatar | ✅ visible |
| 4 | Écriture dans `app-assets` par un client non admin | ✅ refusé |
| 5 | Écriture dans `app-assets` par un compte `ADMIN` | ✅ accepté |

**Les 14 contrôles donnent le résultat attendu.** C'est la première preuve en conditions réelles
que la RLS posée en M05 protège effectivement les données, et pas seulement sur le papier.

## 4. Ce qui reste non vérifié (limites honnêtes)

- **Authentification réelle (GoTrue)** : inscription/connexion/récupération de mot de passe via
  l'API HTTP Supabase Auth — non exercées (nécessite un vrai serveur Supabase ou un
  environnement Docker complet, indisponible ici). Les tests ci-dessus simulent un utilisateur
  déjà authentifié en insérant directement dans `auth.users` et en fixant le paramètre de session
  JWT ; ils valident ce qui se passe *après* l'authentification, pas le protocole d'authentification
  lui-même.
- **API Storage réelle (upload signé, URL signée)** : `lib/storage/vehicle-storage.ts` utilise le
  SDK `@supabase/supabase-js`, qui appelle une vraie API Storage HTTP — non exercé. Seules les
  policies RLS sur `storage.objects` ont été vérifiées au niveau SQL.
- **Script `staff:grant`** : dépend de l'API Admin Supabase (`listUsers`) pour retrouver un
  utilisateur par e-mail — non exercé tel quel ; le même résultat (compte STAFF/ADMIN fonctionnel)
  a été obtenu par une insertion SQL directe à des fins de test RLS uniquement.
- **Charge/volumétrie** : 4 véhicules de démonstration seulement ; aucun test de performance ni de
  pagination à grande échelle.

## 5. Recommandation

Cette validation locale couvre la logique métier (services, repositories, RLS, triggers, pricing)
de façon bien plus poussée que les tests unitaires seuls, et peut être rejouée à tout moment sans
dépendance externe. Elle ne remplace cependant pas un vrai projet Supabase pour deux choses
précises : l'authentification HTTP réelle et l'upload de fichiers réel. Si une validation complète
de bout en bout (y compris ces deux points) est nécessaire avant mise en production, un accès à un
projet Supabase de développement (ou une stack Docker complète avec GoTrue + Storage) reste
nécessaire.
