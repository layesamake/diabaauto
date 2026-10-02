# Rapport de lot 6 — Commandes, disponibilité et suivi logistique

> Référence : `dev.md` §11 lot 6. Corpus faisant foi : génération courante `docs/` (doc 03 §12-13 et §15, doc 08 §7, doc 09 §1 §5-7 §10, doc 10 §5 §8 §10, doc 12, doc 14 §4-5).
> Contrat gelé : `docs/contrat-lot-6.md`. Décisions : `docs/decisions.md` T43-T46.

## 1. Ce qui est livré

| Domaine | Livrable |
|---|---|
| Schéma | Migration **M08** (additive) : enums `ReservationStatus`, `DepositStatus`, `LogisticsEventType` ; tables `reservations`, `vehicle_logistics_events` ; extension de `orders` |
| Atomicité | `createOrder` : commande + véhicule `SOLD` + audit + prospect `ORDER_CONFIRMED` + réservation `CONVERTED` dans **une seule transaction** |
| Invariants | 2 index uniques **partiels** en base (réservation active max par véhicule ; commande active max par véhicule) |
| Acompte | Transitions d'état seulement — **aucun encaissement** (BR-101/102) : montant, devise, référence externe |
| Services | `reservation.service.ts` (10 exports), `order.service.ts` (7 exports), `transitions.service.ts` étendu (réservation, commande, acompte, + `AVAILABLE → SOLD`) |
| Références | `RES-YYYY-NNNNNN` (T43), `CMD-YYYY-NNNNNN` (T44) |
| Repositories | `reservation.repository.ts`, `order.repository.ts` (Prisma, conflits d'index traduits en `CONFLICT`) |
| Écrans | Client « Mes commandes » (`/my-diaba-auto/commandes`) ; back-office « Commandes » (`/admin/commandes`) : liste, fiche, transitions, prix convenus, historique, suivi logistique, réservations et acompte |
| Navigation | « Commandes » ajouté à `AdminHeader` et à l'accueil admin ; entrée « Mes commandes » dans l'espace client |

## 2. Arbitrages (T46) — après lecture du doc 12

Le contrat avait été rédigé **avant** lecture du doc 12 (schéma Prisma de référence). Quatre divergences réelles ont été arbitrées, non contournées :

1. **`CONVERTED`** ajouté à `ReservationStatus` : le doc 12 le porte, et c'est l'état atteint par « CONVERTIR COMMANDE » (doc 09 §5). Conséquence d'intégration : `createOrder` **clôt la réservation en `CONVERTED`** dans la transaction de vente, avec refus si la réservation appartient à un autre véhicule ou n'est pas convertible.
2. **`AVAILABLE → SOLD`** ajouté à la machine véhicule (doc 09 §1 : « AVAILABLE/RESERVED --Vendre--> SOLD »). Le service de commande dupliquait localement cette règle de vente ; la duplication a été supprimée.
3. **`vehicle_logistics_events.created_at` retiré** : absent du doc 03 §15 comme du doc 12 (`event_at` porte l'horodatage).
4. **`orders.vehicle_id` en `NOT NULL`** (doc 12) : le passage en relation obligatoire bascule mécaniquement la FK de `ON DELETE SET NULL` à **`RESTRICT`**, ce qui est aussi la règle du doc 03 §18.

Deux points conservés en l'état, documentés : montants en `Decimal(14,2)` (cohérence interne) plutôt que `18,2` ; FK `vehicle_logistics_events.vehicle_id` en `CASCADE` (doc 12).

## 3. Vérifications réellement exécutées

| Contrôle | Résultat |
|---|---|
| `npx tsc --noEmit` | **0 erreur** |
| `npx eslint .` | **0 erreur** |
| `npx vitest run` | **434 tests / 35 fichiers** verts |
| `node scripts/verify-migrations.mjs` | **ÉCART = 0** (union M01..M08 couvre le schéma) |
| `NODE_ENV=production npm run build` | **verte**, 33 routes (dont `/admin/commandes`, `/my-diaba-auto/commandes`) |
| M08 en transaction annulée sur la base réelle | 39 tables, renommage, `NOT NULL`, FK `RESTRICT`, index partiels, RLS — puis **base inchangée** après `ROLLBACK` |
| `prisma migrate deploy` | **8 migrations**, 39 tables |
| `e2e-lot6.sh` (base réelle) | **34 / 34** |
| `e2e-lot6-rls.sh` (jetons de session réels) | **16 / 16** |
| `repro-lot6.ts` (repositories Prisma réellement exécutés) | **14 / 14** |

### Sévérité du harnais prouvée par mutation

Retrait de `SET NOT NULL` → écart nommé sur `orders.vehicle_id` (exit 1). Retrait de `CONVERTED` → deux messages explicites (exit 1). Le repli structurel a été **étendu** pour gérer `ALTER COLUMN … SET NOT NULL` (extension, pas relâchement) ; aucun contrôle existant n'a été supprimé ni assoupli.

### Ce que l'e2e prouve précisément

- **Invariants dans les deux sens** : une 2ᵉ réservation/commande active sur le même véhicule est refusée, **et** une nouvelle est possible après annulation — c'est le caractère *partiel* de l'index qui est testé.
- **Isolation entre clients** (doc 14 §4) : avec deux comptes réels et leurs jetons, A voit ses 1 réservation et 1 commande, B en voit 0 ; les tables serveur (`order_events`, `vehicle_logistics_events`) répondent **403** à un client authentifié ; aucune écriture client n'est possible (403).
- **Aucun encaissement** : aucune colonne de montant encaissé n'existe sur `reservations`.
- **Vente atomique réelle** : les repositories Prisma exécutés contre la base créent la commande, passent le véhicule `SOLD` et convertissent la réservation `CONVERTED` dans la même transaction ; le conflit d'index partiel remonte bien en `CONFLICT`.
- **Nettoyage** : les trois scripts laissent la base telle qu'ils l'ont trouvée (vérifié après coup).

## 4. Défauts trouvés — et corrigés — pendant le lot

1. **Machine véhicule incomplète** (signalée par un sous-agent) : `AVAILABLE → SOLD` manquait alors que doc 09 §1 l'autorise. Corrigé dans la machine, règle dupliquée supprimée du service (T46).
2. **Contrat antérieur au doc 12** : quatre divergences de schéma (voir §2). Corrigées avant toute application de migration.
3. **Repli structurel incomplet** : il ne savait pas replier `ALTER COLUMN … SET NOT NULL` — détecté parce que le harnais a refusé de mentir. Étendu, puis prouvé par mutation.
4. **Trois bugs dans mes propres scripts de vérification** (pas des défauts produit) : les tables serveur renvoient **403** (et non une liste vide) à un client authentifié ; la suppression d'un compte Auth est **refusée par la FK M06/T39** tant que son profil existe, donc l'ordre de nettoyage est données → profil client → profil → compte ; un de mes nettoyages groupés a supprimé le `customer_profile` du compte ADMIN de test, **restauré à l'identique** (état laissé par le trigger) et vérifié.

## 5. Limites connues

- **Audit hors transaction** : la piste d'audit est écrite par son propre client Prisma, pas par la transaction de vente. Ce comportement est **identique aux lots 1-5 déjà validés** et n'a pas été modifié pour rester cohérent ; l'échec de l'audit fait bien échouer l'appel, mais une panne entre les deux laisserait une entrée d'audit sans vente (ou l'inverse). À traiter globalement si souhaité.
- **`setVehicleSold`** : le schéma n'a pas de colonne `sold_at` sur `vehicles` (le corpus ne l'a pas prévu) ; la date est portée par `updated_at`.
- **D21** toujours en attente : `lead.*` gouverne les demandes personnalisées (T42).
- **`mailer_autoconfirm`** : toujours à basculer à la main dans le tableau de bord Supabase (le PAT n'a pas `auth_config_write`).
- **Compte de test ADMIN** : `admin.validation@diaba-auto.test` existe sur la production (profil `STAFF`, rôle `ADMIN`). Il sert aux vérifications d'écrans. **À supprimer ou à faire tourner avant toute ouverture publique.**

## 6. État de la base de production

8 migrations appliquées, **39 tables**, RLS active, drift 0. Aucune donnée de test résiduelle : `orders` 0, `reservations` 0, `vehicle_logistics_events` 0 ; les 4 véhicules de démonstration sont tous `AVAILABLE`.
