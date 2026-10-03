# Contrat de lot 5 — Approbation Revendeur, tarification et CRM

> Référence : `CLAUDE.md` §11 lot 5 (« Approbation Revendeur, tarification et CRM »).
> Corpus faisant foi : doc 03 §4 (Revendeur) et §11 (CRM), doc 09 §3 et §4 (machines à états),
> doc 07 (permissions), doc 12 (`schema.prisma` proposé).
> Établi par l'orchestrateur. **Toute modification de ce fichier est réservée au parent.**

## 1. Périmètre

### Dans le lot

1. **Demande Revendeur** : un client dépose une demande ; le personnel la prend en charge,
   l'approuve ou la refuse. L'approbation bascule `customer_profiles.pricing_profile = RESELLER`
   et `reseller_status = APPROVED` — c'est ce qui débloque réellement le tarif professionnel
   posé au lot 3 (`services/pricing.service.ts` ne teste que `resellerStatus === "APPROVED"`).
2. **CRM — prospects** : lecture/assignation/évolution de statut des `leads`, journal privé
   (`lead_notes`) et historique d'activités (`lead_activities`).
3. **CRM — demandes sur mesure** : remodelage de `custom_requests` en `custom_vehicle_requests`
   conformément au corpus (rattachement au prospect, marque/modèle demandés, plage d'années).
4. **Back-office** : écrans Clients, Prospects, Demandes, Revendeurs dans `app/admin`.

### Hors du lot (à ne pas implémenter)

- **Commandes, réservations, acomptes, logistique** → lot 6 (`CLAUDE.md` §11).
- **Administration, contenus, paramètres, analytics** (`pages`, `settings`, `analytics_events`) → lot 7.
- **Éligibilité import, règles, événements logistiques** → lot 6.
- Pas de paiement en ligne (V1) : un acompte externe est une **preuve/statut**, jamais un encaissement.
- Aucune notification e-mail : `notifications_enabled` reste sans effet (T35).
- Aucune permission nouvelle n'est inventée (T20). Voir §4 pour la correspondance imposée.

## 2. Schéma gelé (migration `M07`)

### 2.1 `leads` — aligné sur doc 03 §11

Champs corpus : `reference`, `customer_id?`, `name`, `phone`, `whatsapp`, `email?`, `vehicle_id?`,
`source`, `budget_min/max`, `assigned_salesperson_id`, `next_follow_up_at`, statuts
`NEW/CONTACTED/QUALIFIED/NEGOTIATION/ORDER_CONFIRMED/LOST/COMPLETED`.

Modifications (la table est **vide** : aucun lead n'a jamais été écrit) :

| Champ | Action | Détail |
| --- | --- | --- |
| `reference` | **ajout** | `TEXT NOT NULL UNIQUE`, format `LEAD-YYYY-NNNNNN` (décision T41, calquée sur `DBC-YYYY-NNNNNN` de `lib/vehicle-reference.ts`) |
| `first_name` → `name` | **renommage** | le corpus nomme ce champ `name` |
| `whatsapp` | **ajout** | `TEXT` nullable |
| `email` | **ajout** | `TEXT` nullable |
| `source` | **ajout** | `TEXT` nullable — **chaîne libre** : le corpus n'énumère aucune valeur, on n'en invente pas |
| `budget_min`, `budget_max` | **ajout** | `DECIMAL(14,2)` nullable + `CHECK` de non-négativité et de cohérence `min <= max` (même convention que T04) |
| `next_follow_up_at` | **ajout** | `TIMESTAMP(3)` nullable |
| `phone` | conservé | déjà `NOT NULL`, conforme |

`LeadStatus` est **déjà conforme** au corpus : aucune modification.

### 2.2 Nouveaux modèles

```prisma
enum ResellerApplicationStatus { PENDING UNDER_REVIEW APPROVED REJECTED CANCELLED }
enum LeadActivityType { CALL WHATSAPP EMAIL MEETING STATUS_CHANGE }
```

- **`reseller_applications`** (doc 03 §4) : `customer_id` (NOT NULL, FK → `customer_profiles`),
  `company_name` (NOT NULL), `business_type?`, `estimated_volume?`, `status`
  (`ResellerApplicationStatus`, défaut `PENDING`), `reviewed_by?` (FK → `staff_profiles`),
  `reviewed_at?`, `rejection_reason?`, `created_at`, `updated_at`.
  **Invariant corpus « une demande ouverte maximum »** : au plus une ligne par client dont le
  statut est `PENDING` ou `UNDER_REVIEW` — garanti par un **index unique partiel**.
- **`lead_notes`** (doc 03 §11, « Privé ») : `id`, `lead_id` (FK → `leads`, `ON DELETE CASCADE`),
  `author_id` (FK → `staff_profiles`), `content` (NOT NULL), `created_at`. Index `(lead_id, created_at)`.
- **`lead_activities`** : `id`, `lead_id` (FK → `leads`, `ON DELETE CASCADE`), `type`
  (`LeadActivityType`), `description` (NOT NULL), `performed_by?` (FK → `staff_profiles`),
  `created_at`. Index `(lead_id, created_at)`.

### 2.3 `custom_requests` → `custom_vehicle_requests` (doc 03 §11)

Le corpus décrit : `lead_id`, `requested_brand/model`, plage d'années, `budget`, `criteria`, `status`.

| Champ | Action |
| --- | --- |
| table | **renommée** `custom_requests` → `custom_vehicle_requests` (modèle Prisma `CustomVehicleRequest`) |
| `lead_id?` | **ajout** FK → `leads`, `ON DELETE SET NULL` |
| `requested_brand?`, `requested_model?` | **ajout** `TEXT` nullable |
| `year_min?`, `year_max?` | **ajout** `INTEGER` nullable + `CHECK` de cohérence |
| `customer_id?`, `contact_name?`, `contact_phone?`, `criteria_json`, `budget_min/max`, `status` | **conservés à l'identique** (T33 reste valable) |

`RequestStatus` (RECEIVED/QUALIFIED/SEARCHING/PROPOSED/CLOSED/ABANDONED) est **hors corpus**
(écart rédactionnel E28) : il est **conservé tel quel**, aucune valeur inventée.

> **Conséquence à traiter** : le renommage touche du code validé au lot 4
> (`services/custom-request.service.ts`, `repositories/custom-request.repository.ts`, le formulaire
> `/commander`, `app/my-diaba-auto`, tests). Cette reprise est dans le périmètre du lot et doit
> laisser la suite verte.

### 2.4 RLS et privilèges (M07, même fichier de migration)

- RLS **activée** sur les 4 nouvelles/renommées tables (refus par défaut).
- `leads`, `lead_notes`, `lead_activities`, `reseller_applications` : **aucun privilège client**.
  Lecture/écriture **serveur uniquement** (`service_role`) — le portail My Diaba Auto ne les expose pas.
- `custom_vehicle_requests` : conserve **exactement** les privilèges de `custom_requests`
  (le client lit la sienne via `customer_id`).

## 3. Machines à états (doc 09 §3 et §4) — imposées

**Demande Revendeur** (`transitions.service.ts`) :

| Source | Action | Cible |
| --- | --- | --- |
| `PENDING` | prise en charge | `UNDER_REVIEW` |
| `UNDER_REVIEW` | approbation | `APPROVED` |
| `UNDER_REVIEW` | refus | `REJECTED` |
| `PENDING` / `UNDER_REVIEW` | annulation client/admin | `CANCELLED` |

Effet de l'approbation (transactionnel, dans le même appel) :
`pricing_profile = RESELLER` **et** `reseller_status = APPROVED`.
Suspension ultérieure : `reseller_status = SUSPENDED`, le profil est **conservé**.
Toute transition non listée est **refusée** (`VALIDATION`).

**Lead** (doc 09 §4) : `NEW → CONTACTED → QUALIFIED → NEGOTIATION → ORDER_CONFIRMED → COMPLETED`,
avec `LOST` atteignable depuis tout état non terminal. Toute autre transition est refusée.
`CLOSED`/terminal = `COMPLETED` ou `LOST`.

## 4. Permissions (existantes — aucune création)

| Écran / action | Permission | Justification |
| --- | --- | --- |
| Voir les revendeurs / demandes Revendeur | `reseller.view` | — |
| Approuver une demande | `reseller.approve` | — |
| Refuser une demande | `reseller.reject` | — |
| Suspendre un revendeur | `reseller.suspend` | — |
| Lister/consulter un client | `customer.view` | — |
| Modifier un client (segment, coordonnées, statut Revendeur) | `customer.edit` | — |
| Lister/consulter les prospects | `lead.view` | — |
| Assigner un prospect | `lead.assign` | — |
| Modifier un prospect : statut, note, activité | `lead.update` | — |
| Lister/qualifier les demandes sur mesure | `lead.view` / `lead.update` | **Choix explicite** : aucune permission `custom_request.*` n'existe (T20 interdit d'en inventer). Une demande sur mesure est un objet commercial pré-prospect ; `lead.*` la gouverne. À réarbitrer si D21 ajoute des codes dédiés. |

L'accès au portail exige toujours `requireStaff(actor, "vehicle.view")` (`app/admin/page.tsx`).

## 5. Surface gelée — services (les enfants écrivent contre ces noms)

Les services suivent l'architecture existante : **port** (`type XRepository`) + dépendances
injectables `configureX` / `resetX`, testés **sans base** avec des doubles (voir
`services/custom-request.service.ts`).

### `services/lead.service.ts`
```ts
export type { LeadStatus, LeadView, LeadActivityView, LeadNoteView, LeadRow }
export function leadStatusTransitions(status: LeadStatus): LeadStatus[]      // doc 09 §4
export function canTransitionLeadStatus(from: LeadStatus, to: LeadStatus): boolean
export async function listLeads(actor: Actor, filters?: LeadFilters): Promise<LeadView[]>
export async function readLead(actor: Actor, leadId: string): Promise<LeadView>
export async function updateLeadStatus(actor: Actor, leadId: string, next: LeadStatus): Promise<LeadView>
export async function assignLead(actor: Actor, leadId: string, staffId: string | null): Promise<LeadView>
export async function addLeadNote(actor: Actor, leadId: string, content: string): Promise<{ id: string }>
export async function addLeadActivity(actor: Actor, leadId: string, input: LeadActivityInput): Promise<{ id: string }>
```
Garde imposée : tout point d'entrée vérifie la permission (`lead.view` / `lead.assign` / `lead.update`)
via `services/access.service.ts`. Refus **neutre** (`NOT_FOUND`) pour une ressource non visible (T11/T12).

### `services/reseller-application.service.ts`
```ts
export type { ResellerApplicationStatus, ResellerApplicationView }
export function canTransitionResellerApplication(from, to): boolean          // doc 09 §3
export async function submitResellerApplication(actor: Actor, input: unknown): Promise<{ id: string }>
export async function listResellerApplications(actor: Actor, filters?: { status?: ResellerApplicationStatus }): Promise<ResellerApplicationView[]>
export async function reviewResellerApplication(actor: Actor, id: string, action: "START_REVIEW" | "APPROVE" | "REJECT" | "CANCEL", input?: { rejectionReason?: string }): Promise<ResellerApplicationView>
```
`APPROVE` écrit **dans la même transaction** : `reseller_applications.status`, `reviewed_by`,
`reviewed_at`, puis `customer_profiles.pricing_profile = RESELLER` + `reseller_status = APPROVED`.
Chaque transition produit une entrée d'audit (`audit.service.ts` : action `reseller.status.change`).

### `services/staff-customer.service.ts`
```ts
export async function listCustomers(actor: Actor, filters?: CustomerFilters): Promise<CustomerListItem[]>
export async function readCustomer(actor: Actor, customerId: string): Promise<CustomerDetail>
export async function updateCustomer(actor: Actor, customerId: string, patch: unknown): Promise<CustomerDetail>
export async function setResellerStatus(actor: Actor, customerId: string, status: ResellerStatus): Promise<CustomerDetail>
```

### `services/custom-request.service.ts` (reprise lot 4 + ajouts personnel)
Conserve `submitCustomRequest` (parcours public/visiteur). Ajoute :
```ts
export async function listCustomRequests(actor: Actor, filters?: { status?: CustomRequestStatus }): Promise<CustomRequestView[]>
export async function updateCustomRequestStatus(actor: Actor, id: string, next: CustomRequestStatus): Promise<CustomRequestView>
```

### Repositories (implémentation Prisma)
`repositories/lead.repository.ts`, `repositories/lead-note.repository.ts`,
`repositories/lead-activity.repository.ts`, `repositories/reseller-application.repository.ts`,
`repositories/staff-customer.repository.ts` — même forme que les repositories existants
(`createXRepository(prisma)`).

## 6. Vérification (commandes exactes)

```
npx prisma validate
npx tsc --noEmit
npx eslint .
npx vitest run
node scripts/verify-migrations.mjs
npm run build
```
Plus, obligatoirement pour ce lot :

- `npx prisma migrate deploy` sur la base Supabase réelle, puis relecture SQL ligne à ligne par le parent.
- Test manuel du parcours Revendeur de bout en bout (dépôt → prise en charge → approbation →
  `pricing_profile = RESELLER`).
- Contrôle d'accès : un client ne doit atteindre **aucun** écran/`leads`/`reseller_applications`
  (refus neutre), un COMMERCIAL sans `reseller.approve` ne doit pas approuver.

## 7. Interdictions formelles

- Ne pas modifier les migrations `M01`→`M06` déjà appliquées : tout changement est **additif** dans `M07`.
- Ne pas modifier ce contrat, `docs/decisions.md`, `prisma/schema.prisma` ni `scripts/verify-migrations.mjs`
  hors du périmètre explicitement attribué.
- **Ne pas exécuter `git add`, `git commit`, `git stash`** : le parent est seul maître du commit.
- Ne pas créer de permission ni de route back-office hors lot.
- Ne pas inventer de valeur d'enum, de seuil, de tarif ou de coordonnée.
