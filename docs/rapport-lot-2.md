# Rapport de lot — « Authentification, profils, permissions et audit »

> Lot nommé « lot 2 » par `CLAUDE.md` §11 et « Lot 1 — Identité et sécurité » par `docs/15_Roadmap_plan_developpement.docx` (décision D16 : le contenu prime sur le numéro).
> Date du rapport : 2026-09-28. Dépôt : `/opt/data/projects/diabacar`.

## 1. Fonctionnalités désormais utilisables

- **Identité serveur** : résolution de l'acteur à chaque requête (`lib/auth/session.ts`) — visiteur, client (Standard ou Revendeur), personnel, ou **compte suspendu** traité comme non authentifié.
- **Inscription / connexion / récupération / réinitialisation / déconnexion** : écrans complets (`app/(auth)/**`), Server Actions avec validation stricte, limitation de fréquence, messages non révélateurs, route de callback PKCE (`/auth/callback`) et redirections internes validées (aucune redirection ouverte).
- **My Diaba Auto** : tableau de bord, statut Revendeur lisible, édition des seuls champs personnels, état lecture seule pour un compte suspendu, déconnexion.
- **Back-office** : `/admin` protégé par `requireStaff(actor, "vehicle.view")`, refus neutre sans donnée pour tout autre acteur ; les écrans de gestion arrivent aux lots suivants.
- **Permissions** : gardes `requireStaff` / `requireCustomer` / `assertOwnership` / `assertOwnProfile`, refus par défaut, `NOT_FOUND` (jamais `FORBIDDEN`) pour masquer l'existence d'une ressource privée.
- **Audit** : construction d'entrées append-only, actions à auditer fermées, motif obligatoire sur les transitions sensibles, secrets retirés et téléphones masqués.
- **Exploitation** : `npm run db:seed` (seed idempotent), `npm run staff:grant`, `npm run prisma:migrate:*`, `node scripts/verify-migrations.mjs`.

## 2. Données et configuration

- **Migrations** `prisma/migrations/` : M01 identité (10 enums, 6 tables), M02 référentiels/véhicules, M03 activité client (favoris, recherches, prospects, demandes, commandes), M04 journaux + audit + contraintes `CHECK` + index, M05 liaison `auth.users` + RLS + buckets Storage. 158 instructions, dont 72 générées par `prisma migrate diff` (structure) et 86 écrites à la main.
- **SQL complémentaire** : 6 `CHECK` de montants, index de clés étrangères, index partiel catalogue `vehicles(published_at DESC) WHERE status='PUBLISHED'`, `audit_logs` append-only (`REVOKE UPDATE/DELETE/TRUNCATE` + trigger), RLS sur **18 tables** avec **25 policies** en refus par défaut, 4 buckets Storage.
- **Seed** : 2 rôles (`ADMIN`, `COMMERCIAL`), 26 permissions, 35 associations issues de la matrice provisoire D01, réconciliation des associations hors matrice pour les rôles amorcés.
- **Variables** : `.env.example` documenté ; garde `ALLOW_PRODUCTION_DATABASE`, seuils `RATE_LIMIT_*`, `STORAGE_SIGNED_URL_TTL_SECONDS`.
- **Décisions** : `docs/decisions.md` — 15 décisions techniques (T01–T15) et 17 questions produit en attente (D01–D17).

## 3. Vérifications réellement exécutées

| Contrôle | Commande | Résultat |
| --- | --- | --- |
| Typage | `npx tsc --noEmit` | **OK**, 0 erreur |
| Qualité | `npx eslint .` | **OK**, 0 erreur |
| Tests | `npx vitest run` | **14 fichiers, 88 tests, tous verts** |
| Build | `npm run build` | **compilation réussie**, 10 pages, `/my-diaba-auto` et `/admin` en dynamique |
| Cohérence migrations ↔ schéma | `node scripts/verify-migrations.mjs` | **ÉCART = 0** (10 enums, 18 tables, 113 colonnes, 23 index, 21 FK) |
| Schéma | `npx prisma validate` (URL factices) | **valide** |
| Routes réelles | `next start` + requêtes HTTP | 12 routes en **200**, `/my-diaba-auto` et `/admin` en `noindex, nofollow, nocache` |
| Seed | harnais en mémoire (exécuté par le sous-agent) | 26 permissions, 2 rôles, 35 associations, idempotence et réconciliation vérifiées |

## 4. Limites et vérifications non réalisées

- **Aucune base de données accessible** (`.env.local` ne contient que des clés `VITE_*`, non lues par Next) : migrations **non appliquées**, tests RLS/Storage/valeurs de contraintes **non exécutés**. À exécuter sur un environnement non productif (D15).
- **Aucun outil SQL local** (`psql`, analyseur PostgreSQL) : le SQL manuel de M04/M05 est conforme à la documentation Supabase mais n'a pas été parsé par PostgreSQL.
- **Aucun projet Supabase configuré** : les appels réels d'inscription, de connexion, d'envoi d'e-mail et de réinitialisation n'ont pas été exercés de bout en bout ; les chemins vérifiés sont la validation, la limitation de fréquence, l'enveloppe d'erreur et les redirections.
- **`staff:grant`** : gardes et validation d'arguments vérifiées, chemin `listUsers`/upsert non exécuté (pas de `SUPABASE_SERVICE_ROLE_KEY`).
- **`vehicle-images` est un bucket public** : un bucket `public = true` expose ses objets sans passer par RLS. L'exigence « variantes publiées uniquement » n'est donc garantie que si les images sont servies par URL signée ou proxy serveur (décision D18).
- **Rendu authentifié non observé** : le tableau de bord client n'est couvert que par tests unitaires, faute de session réelle.
- **Dépôt GitHub non publié** : le remote `origin` est vide et aucune credential n'est disponible (ni `gh`, ni token). Les commits restent locaux.

## 5. Suite

1. Fournir une base non productive (développement/préproduction) pour appliquer M01–M05 et exécuter les tests RLS par identité (visiteur, Standard, Revendeur, personnel).
2. Trancher la matrice rôle → permission (D01) : le seed et le test anti-dérive suivent la matrice provisoire la plus restrictive.
3. Fournir les valeurs d'exploitation (contact, WhatsApp, devise, marques de départ) — D14.
4. Lot suivant : catalogue public (référentiels, véhicules, recherche, filtres, pagination serveur) en réutilisant `PricingService` et les gardes existantes.
