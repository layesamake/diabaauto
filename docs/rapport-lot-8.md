# Rapport de lot 8 — Recette, sécurité, performance et préparation de production

> Référence : `dev.md` §11 étape 8 ; roadmap `docs/15_Roadmap_plan_developpement.docx` **L10**
> (« Sécurité, SEO, performance, QA, lancement — gate : DoD global »).
> Corpus faisant foi : doc 14 (tests et critères d'acceptation), doc 16 (CI/CD), doc 17 (sécurité),
> doc 18 (SEO et performance), doc 20 (exploitation), doc 11 §9-§11.
> Contrat gelé : `docs/contrat-lot-8.md`. Recette détaillée : `docs/recette-lot-8.md`.
> Procédures d'exploitation : `docs/exploitation-production.md`. Décisions : `docs/decisions.md`
> **T50 à T57** ; écart **E30 refermé**.

## 1. Ce qui est livré

| Domaine | Livrable |
|---|---|
| Sécurité HTTP | `lib/security/http-headers.ts` (module pur) appliqué par `headers()` de `next.config.ts` : CSP, HSTS (production), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `frame-ancestors`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `X-Permitted-Cross-Domain-Policies` ; `poweredByHeader` désactivé |
| Recette sécurité | `scripts/verify-security.mjs` + `npm run verify:security` : 6 contrôles reproductibles, en lecture seule, sans afficher de secret |
| Recette fonctionnelle | `docs/recette-lot-8.md` : chaque cas du doc 14 (prix, véhicule, My Diaba Auto, réservation/commande, RLS, UX) rattaché à une preuve exécutée, et §11 la liste de ce qui n'a pas été exécuté |
| Sauvegarde (E30) | `docs/exploitation-production.md` §4 : procédure écrite **et exercée** (export du schéma de production restauré dans un PostgreSQL 17 local, inventaires identiques) |
| Exploitation | `docs/exploitation-production.md` : inventaire des environnements, variables, checklist de release (doc 16 §6), fenêtre de changement, reprise après incident, runbook d'incidents (doc 20 §10), exploitabilité périodique, prérequis bloquants avant ouverture commerciale |
| Tests | `tests/unit/http-headers.test.ts` — 12 cas |

Aucune fonctionnalité métier n'est ajoutée, aucune donnée n'est modifiée, aucune migration n'est créée (T57).

## 2. En-têtes de sécurité — politique réellement servie

```
Content-Security-Policy: default-src 'self'; base-uri 'self'; form-action 'self';
  frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://<projet>.supabase.co; media-src 'self' blob: https://<projet>.supabase.co;
  font-src 'self' data:; connect-src 'self' https://<projet>.supabase.co wss://<projet>.supabase.co;
  worker-src 'self' blob:; manifest-src 'self'; frame-src 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), …
Strict-Transport-Security: max-age=63072000; includeSubDomains      (production uniquement)
```

Vérifié en local par `GET http://localhost:3100/` (en-têtes présents sur la réponse HTML) et
en production après déploiement.

## 3. Vérification

### Tests et compilation

| Contrôle | Résultat |
|---|---|
| `npx tsc --noEmit --incremental false` | **0 erreur** |
| `npx eslint .` | **0 erreur** |
| `npx vitest run` | **499 tests / 42 fichiers**, tous verts (487 avant le lot) |
| `NODE_ENV=production npm run build` | Vert |
| `node scripts/verify-migrations.mjs` (CI) | `ÉCART = 0` |

### Recette de sécurité contre la base réelle — 6 / 6

`npm run verify:security` sur le projet Supabase de production :

| # | Contrôle | Résultat |
|---|---|---|
| 1 | 28 tables privées lues avec la clé publique | **28 refus** (HTTP 401-403), 0 ligne exposée |
| 2 | Colonne `vehicles.reseller_price` | **HTTP 400** (permission denied for column) |
| 3 | Catalogue anonyme | 4 véhicules, tous `is_published = true` |
| 4 | Bucket privé `vehicle-documents` | Non listable (liste vide) |
| 5 | `service_role` et `DATABASE_URL` dans le bundle client | **Absents** de 60 fichiers de `.next/static` |
| 6 | Secrets dans les fichiers suivis par git | **Aucun** (323 fichiers) ; `.env.local` ignoré |

### Essai de sauvegarde / restauration (E30)

Export `pg_dump --schema-only` de la production → restauration dans un PostgreSQL 17 local →
inventaires **identiques** : 39 tables, 311 colonnes, 104 index, 106 contraintes, 16 policies,
6 fonctions, 38 tables sous RLS. Restauration sans erreur, base d'essai supprimée.
Aucune donnée métier exportée (schéma seul).

### Recette dans un navigateur, sur le déploiement de production

| Contrôle | Résultat |
|---|---|
| Accueil et catalogue en 360 px | Aucun débordement horizontal |
| Fiche véhicule en 390 px | Aucun débordement ; `canonical`, `robots: index`, Open Graph et JSON-LD `Vehicle` corrects ; **prix Standard seul**, aucun champ fournisseur |
| CTA WhatsApp | Lien `wa.me` avec message pré-rempli (titre, référence, prix public, lien de la fiche) |
| Espaces privés | `GET /admin`, `/admin/personnel`, `/my-diaba-auto` → **307 vers `/connexion?suivant=…`** |
| `robots.txt` / `sitemap.xml` | Zones privées fermées ; URL absolues de production ; véhicules vendus exclus |
| Fiche inexistante | Page « introuvable » + `noindex` ; **statut HTTP 200 (soft-404 assumé, T55)** |

### Performance mesurée et défaut corrigé

| Page | Avant | Après | Cible doc 18 §6 |
|---|---|---|---|
| `/voitures` | **5,19 s** | **0,42 s** (LCP 0,54 s) | ≤ 2,5 s : **atteinte** |
| Fiche véhicule | **3,11 s** (CLS 0,17) | **0,37 s** (LCP 0,52 s, CLS 0) | LCP ≤ 2,5 s et CLS ≤ 0,1 : **atteintes** |
| Accueil, `/marque/[brand]` | — | LCP 0,32–1,25 s, CLS 0 | atteintes |

Cause : projet Supabase en **`eu-west-1`**, fonctions Vercel par défaut en **`iad1`** — une trentaine
d'allers-retours transatlantiques par rendu (TTFB 0,10 s mais 5,19 s au total). Correction :
`"regions": ["dub1"]` (T58). Mesures de laboratoire dans un navigateur réel, pas de données de
terrain ; elles restent comparables entre elles et reproductibles.

### Nettoyage des comptes internes (T59)

Sur autorisation explicite : 2 `customer_profiles` parasites supprimés (aucune activité — contrôle
bloquant), compte de validation `admin.validation@diaba-auto.test` passé `DISABLED` avec entrée
d'audit `staff.deactivate`. Après opération : `customer_profiles = 0`, **2 ADMIN actifs** + 1
désactivé. Aucune donnée commerciale touchée.

## 4. Constats et limites (à ne pas présenter comme résolus)

| # | Constat | Nature |
|---|---|---|
| 1 | **CSP sans `nonce`** : `'unsafe-inline'` sur les scripts. Un `nonce` forcerait le rendu dynamique de toutes les pages (contre la cible LCP du doc 18 §6). Restriction d'origines, `object-src 'none'`, `base-uri`, `form-action` et `frame-ancestors` effectifs | Limite technique assumée (T51) |
| 2 | **HSTS sans `preload`** : le domaine servi est un sous-domaine `*.vercel.app` partagé | Limite technique assumée (T52) |
| 3 | **Rate limiting en mémoire, par instance** : sur Vercel, chaque instance a son compteur | Limite technique assumée (T56), arbitrage d'infrastructure |
| 4 | **Soft-404** sur une fiche inexistante (`200` + `noindex`) | Limite technique assumée (T55) |
| 5 | **Aucune supervision d'erreurs** (ni Sentry ni équivalent) ; les Core Web Vitals sont mesurés en laboratoire mais **aucune sonde de terrain** (CrUX/RUM) ne suit la production en continu | Prérequis d'ouverture commerciale |
| 6 | **Sauvegarde gérée Supabase non confirmée** (plan) ; restauration des **données** non exercée | Prérequis d'ouverture commerciale |
| 7 | **`mailer_autoconfirm = false` + aucun SMTP** : inscription, vérification d'adresse et réinitialisation par e-mail **inopérantes**. Le basculement est **bloqué en ligne de commande** (jeton sans `auth_config_write`, 403) | Action de Diaba Auto au tableau de bord Supabase (T60) |
| 8 | **Locales EN et AR / RTL non livrées** ; site en français seulement | Décision **D29** en attente (fourniture des traductions relues et stratégie de routage) |
| 9 | **Aucun environnement de préproduction** : les migrations ne sont validées qu'hors ligne avant la production ; les prévisualisations Vercel n'ont **aucune** variable d'environnement | D15 en attente |
| 10 | Résidus du lot 7 : 2 `customer_profiles` et 1 compte de test sur la production | **Nettoyés pendant ce lot** (T59) : résidus supprimés, compte de validation `DISABLED` avec audit |
| 11 | **D03** (workflow d'approbation d'une habilitation) et **D21** (liste canonique des permissions) | Arbitrages produit en attente |
| 12 | **`APP_ENV` valait `development` dans l'environnement Production de Vercel** : la CSP servie contenait `'unsafe-eval'` et la branche de production (HSTS, `upgrade-insecure-requests`) n'était pas prise | **Trouvé et corrigé dans ce lot** : variable fixée à `production`, déploiement rejoué, en-têtes revérifiés en production |

## 5. Reste à faire

| # | Point | Nature |
|---|---|---|
| 1 | ~~Nettoyage des 2 `customer_profiles` résiduels et du compte `admin.validation@diaba-auto.test`~~ | **Fait (T59)** — résidus supprimés, compte `DISABLED` avec audit |
| 2 | Bascule `mailer_autoconfirm` (ou fournisseur SMTP) | **Au tableau de bord Supabase** : le jeton disponible ne porte pas `auth_config_write` (403). Sans cela, inscription et réinitialisation par e-mail restent inopérantes |
| 3 | Supervision d'erreurs et sonde de terrain des Core Web Vitals | À provisionner (outil + compte) |
| 4 | Confirmation du plan de sauvegarde Supabase et essai de restauration **des données** dans un projet de test | Décision + environnement de test |
| 5 | Environnement de préproduction (et variables des prévisualisations Vercel) | D15 |
| 6 | Traductions EN/AR relues et stratégie de routage | D29 |
| 7 | D03 / D21 | Arbitrages produit |
| 8 | Intégration de `npm run verify:security` à la CI | Nécessite des droits **administrateur** sur le dépôt pour déclarer les variables publiques (`gh variable set NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`) ; le compte utilisé n'est pas administrateur du dépôt |
| 9 | Visibilité du dépôt GitHub (actuellement **public**) | Décision de Diaba Auto ; aucun secret n'y est présent (vérifié) |

## 6. Appréciation de l'état du produit

Les huit lots de la roadmap sont livrés et **aucun critère d'acceptation du corpus n'est en échec**.
Ce lot a en outre corrigé deux défauts réels mesurés en production — `APP_ENV=development` (CSP
affaiblie) et l'écart de région Vercel/Supabase (×12 sur le temps de réponse) — et nettoyé les
résidus de comptes internes.

Une seule réserve **bloque réellement l'ouverture commerciale** : **l'inscription et la
réinitialisation de mot de passe par e-mail ne fonctionnent pas** (`mailer_autoconfirm = false` et
aucun SMTP), et son basculement est hors de portée du code disponible. S'y ajoutent deux prérequis
opérationnels : **aucune supervision d'erreurs** n'est installée et **le plan de sauvegarde Supabase
n'est pas confirmé**. Ces points sont inscrits dans `docs/exploitation-production.md` §11.