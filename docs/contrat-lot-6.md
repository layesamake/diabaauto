# Contrat de lot 6 — Commandes, disponibilité et suivi logistique

> Référence : `CLAUDE.md` §11 lot 6 (« Commandes, disponibilité et suivi logistique »).
> Corpus faisant foi : **génération courante `docs/`** — doc 03 §12-13 et §15 (modèle), doc 08 §7 (règles), doc 09 §5-7 et §10 (machines et transactions), doc 10 §5, §8, §10 (services, idempotence, événements), doc 14 §5 (acceptation).

Ce contrat est **gelé**. Aucun sous-agent ne le modifie. Toute divergence constatée se rapporte, elle ne se contourne pas.

## 1. Périmètre

**Dans le lot** : réservations et acompte externe, commandes, transitions de commande, disponibilité commerciale du véhicule (réservation/vente), historique logistique, écrans « Mes commandes » (My Diaba Auto) et « Commandes » (back-office).

**Hors lot** (ne pas implémenter) : tout encaissement (BR-101 : aucun paiement dans Diaba Auto V1) ; importabilité et éligibilité (`import_eligibility_rules`, lot ultérieur) ; analytics ; CMS ; simulateur rendu Dakar (doc 05 §158, explicitement hors lot initial).

## 2. Schéma — migration M08 (strictement additive, M01–M07 intactes)

### 2.1 Enums nouveaux

```prisma
enum ReservationStatus { PENDING CONFIRMED CANCELLED EXPIRED CONVERTED }
enum DepositStatus     { NOT_REQUIRED REQUESTED REPORTED VERIFIED REJECTED }
enum LogisticsEventType {
  SUPPLIER INSPECTION PURCHASE_CONFIRMED PORT_CHINA SHIPPED AT_SEA
  ARRIVED_SENEGAL CUSTOMS AVAILABLE_SENEGAL DELIVERED
}
```
`ReservationStatus` : dérivé de doc 09 §5 (PENDING → CONFIRMER → CONFIRMED ; PENDING/CONFIRMED → Annuler ; CONFIRMED → Expirer ; **CONFIRMED → Convertir commande → CONVERTED**) et du doc 12 (`CONVERTED` y figure explicitement).
`DepositStatus` : dérivé de doc 09 §6 (`NOT_REQUIRED | REQUESTED → REPORTED → VERIFIED | REJECTED`).
`LogisticsEventType` : liste **verbatim** de doc 03 §15.

### 2.2 `reservations` (nouveau — doc 03 §12)

`id`, `reference` **unique** (`RES-YYYY-NNNNNN`, décision T43), `vehicle_id`, `customer_id`, `lead_id?`, `status` (défaut `PENDING`), `expires_at?`, `agreed_price?` (Decimal 14,2), `deposit_required` (Bool, défaut false), `deposit_amount?`, `deposit_currency?`, `deposit_status` (défaut `NOT_REQUIRED`), `external_deposit_reference?`, `confirmed_by?` (→ `staff_profiles`), `created_at`, `updated_at`.

Invariant en base : **index unique partiel « une réservation active maximum par véhicule »** sur `(vehicle_id) WHERE status IN ('PENDING','CONFIRMED')`.

### 2.3 `orders` (extension — doc 03 §13)

Champs **à ajouter** : `lead_id?`, `reservation_id?`, `salesperson_id` (→ `staff_profiles`), `agreed_vehicle_price` (Decimal 14,2, **NOT NULL**), `agreed_transport_price?` (Decimal 14,2), `confirmed_at`, `estimated_arrival_at?`, `delivered_at?`.
`agreed_price` existant → **renommé** `agreed_vehicle_price` (table vide, renommage sûr).
`vehicle_id` existant (nullable depuis M03) → **`NOT NULL`** (doc 12 : `vehicleId String` ; une commande sans véhicule n'a pas de sens) et sa FK passe de `ON DELETE SET NULL` à **`ON DELETE RESTRICT`** (défaut Prisma pour une relation obligatoire, et règle doc 03 §18).
`OrderStatus` existant (`CONFIRMED PROCESSING IN_TRANSIT ARRIVED DELIVERED CANCELLED`) est **déjà conforme** à doc 09 §7 : ne pas le modifier.

Invariant en base : **index unique partiel « une commande active maximum par véhicule »** sur `(vehicle_id) WHERE status <> 'CANCELLED'` (BR-103).

### 2.4 `vehicle_logistics_events` (nouveau — doc 03 §15)

`id`, `vehicle_id`, `event_type` (`LogisticsEventType`), `location?`, `description?`, `event_at` (défaut now), `created_by?` (→ `profiles`).
**Pas de `created_at`** : ni doc 03 §15 ni doc 12 ne le prévoient (arbitrage T46).

### 2.5 `order_events` — conservé

`OrderEvent` (existant : `status`, `note?`, `occurred_at`) reste **l'historique des transitions de commande**. Ne pas le confondre avec `vehicle_logistics_events`, qui suit le **véhicule**.

### 2.6 RLS et privilèges

- `reservations` : le client lit **ses propres** lignes ; aucune écriture client.
- `orders` : le client lit **ses propres** lignes ; aucune écriture client.
- `order_events` : **serveur uniquement** (aucun privilège `anon`/`authenticated`).
- `vehicle_logistics_events` : **serveur uniquement**.
- Toute table nouvelle : RLS **activée** ; tout refus est un refus par défaut.

## 3. Machines à états et effets transactionnels (doc 09)

### 3.1 Réservation
`PENDING --Confirmer--> CONFIRMED` (vérifie la disponibilité ; effet : `Vehicle.commercial_status = RESERVED`) · `CONFIRMED --Maintenir--> CONFIRMED` · `PENDING|CONFIRMED --Annuler--> CANCELLED` (effet : le véhicule peut revenir `AVAILABLE`) · `CONFIRMED --Expirer--> EXPIRED` (libère) · `CONFIRMED --Convertir commande--> CONVERTED` (terminal, posé par la vente — §3.4).
**Transaction atomique (doc 09 §10)** : `Reservation CONFIRMED` + `Vehicle RESERVED` + Audit.

### 3.2 Acompte externe
`NOT_REQUIRED | REQUESTED --Reporter--> REPORTED --Vérifier--> VERIFIED` · `REPORTED --Refuser--> REJECTED`. Aucun paiement, aucune intégration : on enregistre montant, devise, statut et référence externe (BR-102).

### 3.3 Commande (doc 09 §7)
`CONFIRMED --PROCESSING--> PROCESSING --> IN_TRANSIT --> ARRIVED --> DELIVERED` · `--> CANCELLED` selon règles métier.

### 3.4 Effet critique — la vente (doc 09 §1, §5, §10, BR-104, doc 14 §5)
**Transaction atomique unique** : `Order` créée/confirmée + `Vehicle.commercial_status = SOLD` + `Audit` + `lead.status = ORDER_CONFIRMED` (si un lead est rattaché) + `reservation.status = CONVERTED` (si une réservation est rattachée : « CONVERTIR COMMANDE », doc 09 §5).
La vente est possible depuis `AVAILABLE` **ou** `RESERVED` (doc 09 §1 : « AVAILABLE/RESERVED --Vendre--> SOLD ») : la machine véhicule est étendue en conséquence (§5, T46).

### 3.5 Concurrence (BR-103, doc 14 §5)
Deux commandes concurrentes sur le même véhicule → **CONFLIT** (code `CONFLICT`, HTTP 409). Double clic → **une seule** réservation (idempotence). La garantie est **en base** (index uniques partiels) **et** appliquée par transaction ; aucune vérification « lire puis écrire » seule.

## 4. Permissions — aucune création (T20)

`vehicle.reserve` (réserver) · `vehicle.mark_sold` (vendre) · `order.create` (créer une commande, vérification de disponibilité) · `order.view` (lister : **propriété client**) · `order.update` (transitions de commande).

## 5. Surface de services gelée

| Module | Exports |
|---|---|
| `services/reservation.service.ts` | `createReservation`, `confirmReservation`, `cancelReservation`, `expireReservation`, `reportDeposit`, `verifyDeposit`, `rejectDeposit`, `listReservations`, `readReservation`, `listOwnReservations` + port `ReservationRepository` |
| `services/order.service.ts` | `createOrder`, `updateOrderStatus`, `readOrder`, `listOrders`, `listOwnOrders`, `addLogisticsEvent`, `listLogisticsEvents` + port `OrderRepository` (`transaction` porte, dans **une seule** transaction : commande, `SOLD`, audit, lead `ORDER_CONFIRMED` et réservation `CONVERTED` — d'où `findReservationById`/`setReservationStatus` sur le port) |
| `services/transitions.service.ts` | **étendre** : `ReservationStatus` + `reservationTransitions` + `canTransitionReservationStatus` ; `OrderStatus` + `orderTransitions` + `canTransitionOrderStatus` ; `DepositStatus` + `depositTransitions` + `canTransitionDepositStatus`. Machine véhicule : **une seule extension**, `AVAILABLE → SOLD` (doc 09 §1, T46) ; le reste inchangé. |
| `lib/reservation-reference.ts` | `formatReservationReference(year, sequence)` → `RES-YYYY-NNNNNN` (T43), calqué sur `lib/vehicle-reference.ts` |
| `lib/order-reference.ts` | `formatOrderReference(year, sequence)` → `CMD-YYYY-NNNNNN` (T44), calqué sur `lib/vehicle-reference.ts` |

Le prix convenu est **figé à la création** et **jamais recalculé** (BR-105) : `createOrder` reçoit `agreedVehiclePrice` et `agreedTransportPrice` et les stocke ; `updateOrderStatus` ne les touche jamais.

## 6. Écrans

- **My Diaba Auto — « Mes commandes »** : liste des commandes du client connecté (référence, véhicule, statut, prix convenu), garde `requireCustomer` ; un client ne voit **jamais** la commande d'un autre (doc 14 §4).
- **Back-office — « Commandes »** : liste (filtres statut/recherche), fiche commande (transitions autorisées, prix convenus, historique `order_events`, événements logistiques du véhicule), garde `requireStaff(actor, "order.view")` ; création/transition `order.create`/`order.update` ; réservation `vehicle.reserve` ; vente `vehicle.mark_sold`.
- Navigation : ajouter « Commandes » à `components/admin/AdminHeader.tsx` et à `app/admin/page.tsx` (réservés au parent).

## 7. Décisions prises (réversibles, à consigner dans `docs/decisions.md`)

- **T43** — référence de réservation `RES-YYYY-NNNNNN` (le corpus impose l'unicité, pas le format).
- **T44** — référence de commande `CMD-YYYY-NNNNNN`.
- **T45** — idempotence par **contrôle transactionnel + index uniques partiels en base**, plutôt qu'une clé d'idempotence applicative (doc 10 §8 autorise l'un ou l'autre). Raison : la garantie contre les doubles ventes doit survivre à deux instances serveur concurrentes, ce qu'une clé applicative seule ne garantit pas sans stockage partagé.
- **T46** — arbitrages de schéma du lot 6 rendus après lecture du doc 12 (schéma Prisma de référence) : `ReservationStatus` **porte `CONVERTED`** (doc 12) ; la vente est ouverte depuis `AVAILABLE` comme depuis `RESERVED` (doc 09 §1) ; `vehicle_logistics_events` **n'a pas de `created_at`** (absent de doc 03 §15 comme de doc 12) ; `orders.vehicle_id` passe `NOT NULL` avec FK `RESTRICT` (doc 12 + doc 03 §18) ; les montants restent en `Decimal(14,2)` (cohérence interne du projet) plutôt que `Decimal(18,2)` (doc 12) ; la FK `vehicle_logistics_events.vehicle_id` reste `ON DELETE CASCADE` (doc 12), un véhicule portant une commande ou une réservation étant de toute façon indestructible (doc 03 §18).

## 8. Vérification exigée

`npx tsc --noEmit` · `npx eslint .` · `npx vitest run` · `node scripts/verify-migrations.mjs` (écart 0, sévérité préservée) · `NODE_ENV=production npm run build`.

Puis, sur la **base réelle** : transaction de vente (commande + SOLD + audit), double clic → une seule réservation, deux commandes concurrentes → conflit, un client n'accède pas aux commandes d'un autre, RLS (refus de `order_events`/`vehicle_logistics_events` en `anon` comme en `authenticated`).

## 9. Hors périmètre explicite

Paiement/encaissement · importabilité · notifications e-mail · pagination (sauf si déjà disponible) · refonte des modules validés des lots 1–5 · toute permission nouvelle.

## 10. Contraintes de travail

Périmètres de fichiers **disjoints** par sous-agent. Interdictions : modifier ce contrat, `docs/decisions.md`, `prisma/schema.prisma` ou `scripts/verify-migrations.mjs` hors périmètre attribué ; `git add`/`commit`/`stash` ; toute connexion à une base ; `npm run build` (réservé au parent, pour éviter les écritures concurrentes dans `.next`). Un module manquant se **rapporte**, il ne se crée ni ne se stubbe par un agent hors périmètre.
