# Rapport de lot 5 — Approbation Revendeur, tarification et CRM

**Lot** : `dev.md` §11 lot 5 — « Approbation Revendeur, tarification et CRM » (les commandes relèvent du lot 6).
**État** : livré et vérifié sur la base Supabase réelle.
**Contrat** : `docs/contrat-lot-5.md` (gelé avant tout développement).

## 1. Ce qui a été livré

### 1.1 Schéma — migration M07 (`prisma/migrations/20261002180000_m07_crm_revendeur/`)

Alignement sur le corpus faisant foi (doc 03 §4 et §11), strictement **additif** — aucune migration M01–M06 modifiée :

| Objet | Contenu |
|---|---|
| `reseller_applications` (nouveau) | `company_name`, `business_type`, `estimated_volume`, statut, `reviewed_by`, `reviewed_at`, `rejection_reason` |
| `lead_notes` (nouveau) | journal **privé** d'un prospect : `lead_id`, `author_id`, `content` |
| `lead_activities` (nouveau) | historique : `type` (CALL/WHATSAPP/EMAIL/MEETING/STATUS_CHANGE), `description`, `performed_by` |
| `leads` (étendu) | `reference` unique, `firstName` → **`name`** (le corpus dit `name`), `whatsapp`, `email`, `source`, `budget_min`, `budget_max`, `next_follow_up_at` |
| `custom_requests` → **`custom_vehicle_requests`** | renommage du modèle et de la table, + `lead_id`, `requested_brand`, `requested_model`, `year_min`, `year_max` |

Contraintes posées en base : **index unique partiel** `reseller_applications_one_open_per_customer_idx` (invariant « une demande ouverte maximum », doc 03 §4), unicité de `leads.reference`, `CHECK` budget (`budget_min <= budget_max`) et plage d'années.

**Sécurité** : RLS activée sur les 5 tables ; `leads`, `lead_notes`, `lead_activities` et `reseller_applications` sont en **accès serveur uniquement** — la policy `leads_select_own` de M05 a été retirée et les privilèges révoqués à `anon`/`authenticated`. `custom_vehicle_requests` conserve ses privilèges d'origine (le renommage préserve les OID).

### 1.2 Machines à états (`services/transitions.service.ts`)

- **Demande Revendeur** (doc 09 §3) : `PENDING → UNDER_REVIEW → APPROVED | REJECTED`, annulation possible tant que la demande est ouverte.
- **Prospect** (doc 09 §4) : `NEW → CONTACTED → QUALIFIED → NEGOTIATION → ORDER_CONFIRMED → COMPLETED`, avec `LOST`.
- La machine véhicule existante est inchangée.

### 1.3 Services et repositories

| Fichier | Rôle |
|---|---|
| `services/lead.service.ts` + 3 repositories | lister, consulter, assigner, changer le statut, ajouter notes privées et activités |
| `services/reseller-application.service.ts` + repository | déposer une demande, la lister, la prendre en charge, l'approuver (transaction : statut + `pricing_profile=RESELLER` + `reseller_status=APPROVED` + audit), la refuser avec motif |
| `services/staff-customer.service.ts` + repository | lister, consulter, modifier un client (segment, coordonnées), régler le statut Revendeur |
| `services/custom-request.service.ts` (étendu) | `listCustomRequests`, `updateCustomRequestStatus` côté personnel |
| `lib/lead-reference.ts` | référence `LEAD-YYYY-NNNNNN` (décision T41) |

### 1.4 Back-office — 4 nouveaux écrans

`/admin/revendeurs` (file des demandes, prise en charge, approbation, refus motivé, annulation) · `/admin/prospects` (liste + fiche : assignation, statut, notes privées, historique) · `/admin/demandes` (demandes sur mesure et leur avancement) · `/admin/clients` (liste + fiche : segment, coordonnées, statut Revendeur). Navigation et accueil `/admin` mis à jour.

Chaîne d'autorisation : `requireStaff` côté service (`lead.view` / `lead.assign` / `lead.update`, `reseller.view` / `reseller.approve` / `reseller.reject`, `customer.view` / `customer.edit`) **et** refus neutre via `AdminAccessDenied` côté page, sans aucune donnée. Aucune permission nouvelle n'a été créée (T20) — la demande sur mesure reste gouvernée par `lead.*` (décision T42, arbitrage D21 en attente).

## 2. Vérifications réellement exécutées

| Contrôle | Résultat |
|---|---|
| `npx tsc --noEmit` | **0 erreur** |
| `npx eslint` | **0 erreur** |
| `npx vitest run` | **358 tests / 31 fichiers**, tous verts (276 avant le lot) |
| `node scripts/verify-migrations.mjs` | **écart 0** ; contrôles M04/M05 conservés ; nouvelles vérifications : renommages, RLS des tables nouvelles, accès serveur-seul, index « une demande ouverte » |
| Sévérité du harnais | prouvée par **mutation** : colonne retirée → écart 1 et sortie 1 |
| `npm run build` | **31 routes** (25 + 6) — voir §4 |
| Application de M07 sur la base réelle | **37 tables**, index partiel conforme, RLS active partout |
| Bout en bout base réelle (`e2e-lot5-v2.sh`) | **22/22** : compte client → demande PENDING → 2ᵉ demande refusée → approbation (`RESELLER/APPROVED`) → prospect + référence unique + note + activité → statut hors énumération refusé → CHECK budget → nettoyage, 0 orphelin |
| RLS réelle via PostgREST | `leads`, `lead_notes`, `lead_activities`, `reseller_applications` : **HTTP 401** pour `anon` **et** `authenticated` |
| Écrans avec un **ADMIN réel** | les 5 écrans renvoient **HTTP 200** et rendent le contenu métier |
| Écrans en visiteur anonyme | **307 → `/connexion`** sur les 5 |
| Non-régression publique après le renommage | `/`, `/voitures`, `/commander`, `/connexion` : **200** |

## 3. Défauts trouvés et corrigés pendant l'intégration

1. **Service clients non câblé** (signalé par un sous-agent) : `services/staff-customer.service.ts` utilisait par défaut un repository « non configuré » qui échoue — l'écran Clients aurait renvoyé une erreur interne. Corrigé : repository Prisma par défaut, comme tous les autres services.
2. **Faux négatifs de mes propres contrôles** : ma première version du script de bout en bout annonçait des succès qui étaient en réalité des erreurs SQL (un test « la 2ᵉ demande est refusée » passait pour la mauvaise raison). Corrigé en faisant échouer explicitement le script sur toute erreur SQL ; c'est la version v2 dont les 22/22 sont cités ci-dessus.
3. Deux attentes erronées de ma part, sans rapport avec le produit : `reseller_status` par défaut vaut `NOT_APPLICABLE` (et non `NONE`), et **aucune table du projet n'a de défaut en base pour `id`/`updated_at`** — c'est la convention Prisma (valeurs fournies côté client), y compris pour les tables préexistantes. M07 est donc cohérent.

## 4. Piège d'environnement à connaître

`next build` **échoue** dans cet environnement si `NODE_ENV=development` est présent, avec un message trompeur :

```
Error: <Html> should not be imported outside of pages/_document.
```

Le build est vert avec `NODE_ENV=production` (ce que fait Vercel). Ce n'était donc pas un défaut du lot 5 — j'ai d'abord cru à une régression et bissecté pour rien. Toujours construire avec `NODE_ENV=production`.

## 5. Limites connues

- L'assignation d'un prospect à un tiers se fait en saisissant l'identifiant du profil commercial : l'annuaire du personnel n'est pas exposé au lot 5.
- `/admin/demandes` n'a pas de fiche détaillée : `custom-request.service.ts` n'expose pas de `readCustomRequest` (hors surface gelée).
- Les listes ne sont pas paginées (la surface gelée n'expose pas de pagination).
- `mailer_autoconfirm` reste à basculer à la main dans le tableau de bord Supabase (le PAT n'a pas `auth_config_write`).
- L'arbitrage D21 (codes de permission du CRM) reste ouvert : `lead.create` et `custom_request.*` prescrits par le corpus n'existent pas encore.
