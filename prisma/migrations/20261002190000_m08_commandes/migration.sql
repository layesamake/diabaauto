-- ============================================================================
-- Diaba Auto - M08 : réservations, commandes (extension), suivi logistique
-- ============================================================================
-- Migration ADDITIVE (contrat lot 6 §2). Les migrations M01..M07 sont déjà
-- appliquées sur la base réelle : AUCUNE n'est modifiée ici.
--
-- Renommage explicitement porté par cette migration (sans perte) :
--   * colonne orders.agreed_price -> orders.agreed_vehicle_price
--     (la table `orders` est VIDE : aucun backfill n'est nécessaire ; le
--     renommage conserve la contrainte NOT NULL et le CHECK de montant, dont
--     l'expression est automatiquement réécrite par PostgreSQL).
--
-- Volontairement NON modifiés : l'enum `OrderStatus` (déjà conforme doc 09 §7),
-- la table `order_events` (historique des transitions de COMMANDE, contrat §2.5)
-- et la colonne `orders.vehicle_id` (nullable depuis M03 : le contrat §2.3 ne
-- prescrit pas son passage en NOT NULL ; écart doc 12 §Order signalé, cf. rapport).
--
-- Invariants en base posés ici (non exprimables par Prisma) :
--   * « une réservation active maximum par véhicule »
--       reservations.vehicle_id WHERE status IN ('PENDING','CONFIRMED')
--   * « une commande active maximum par véhicule » (BR-103)
--       orders.vehicle_id WHERE status <> 'CANCELLED'
--
-- Champs de structure alignés sur la sortie de :
--   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script

-- ----------------------------------------------------------------------------
-- 1. Enums (contrat §2.1)
-- ----------------------------------------------------------------------------
-- ReservationStatus : dérivé de doc 09 §5 **et doc 12** (`PENDING CONFIRMED CANCELLED EXPIRED
-- CONVERTED`). `CONVERTED` est l'état atteint quand une réservation confirmée est convertie en
-- commande (doc 09 §5, ligne « CONVERTIR COMMANDE »).
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'CONVERTED');

-- DepositStatus : dérivé de doc 09 §6.
CREATE TYPE "DepositStatus" AS ENUM ('NOT_REQUIRED', 'REQUESTED', 'REPORTED', 'VERIFIED', 'REJECTED');

-- LogisticsEventType : liste verbatim de doc 03 §15.
CREATE TYPE "LogisticsEventType" AS ENUM ('SUPPLIER', 'INSPECTION', 'PURCHASE_CONFIRMED', 'PORT_CHINA', 'SHIPPED', 'AT_SEA', 'ARRIVED_SENEGAL', 'CUSTOMS', 'AVAILABLE_SENEGAL', 'DELIVERED');

-- ----------------------------------------------------------------------------
-- 2. `orders` — renommage du prix convenu (table vide)
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders RENAME COLUMN "agreed_price" TO "agreed_vehicle_price";

-- Alignement du nom de la contrainte CHECK de montant (T04) sur la colonne renommée.
ALTER TABLE public.orders RENAME CONSTRAINT "orders_agreed_price_non_negative" TO "orders_agreed_vehicle_price_non_negative";

-- ----------------------------------------------------------------------------
-- 3. `reservations` (nouveau — contrat §2.2, doc 03 §12)
-- ----------------------------------------------------------------------------
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "lead_id" UUID,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3),
    "agreed_price" DECIMAL(14,2),
    "deposit_required" BOOLEAN NOT NULL DEFAULT false,
    "deposit_amount" DECIMAL(14,2),
    "deposit_currency" VARCHAR(3),
    "deposit_status" "DepositStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "external_deposit_reference" TEXT,
    "confirmed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reservations_reference_key" ON "reservations"("reference");

-- Invariant corpus « une réservation active maximum par véhicule » : index unique
-- PARTIEL (impossible à exprimer en Prisma, d'où sa présence ici).
CREATE UNIQUE INDEX "reservations_one_active_per_vehicle_idx"
  ON public.reservations ("vehicle_id")
  WHERE status IN ('PENDING', 'CONFIRMED');

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 4. `vehicle_logistics_events` (nouveau — contrat §2.4, doc 03 §15)
-- ----------------------------------------------------------------------------
CREATE TABLE "vehicle_logistics_events" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "event_type" "LogisticsEventType" NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "event_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "vehicle_logistics_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vehicle_logistics_events_vehicle_id_event_at_idx" ON "vehicle_logistics_events"("vehicle_id", "event_at");

ALTER TABLE "vehicle_logistics_events" ADD CONSTRAINT "vehicle_logistics_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_logistics_events" ADD CONSTRAINT "vehicle_logistics_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 5. `orders` — colonnes ajoutées (contrat §2.3) et clés étrangères
-- ----------------------------------------------------------------------------
-- `orders` est vide : les colonnes NOT NULL sans valeur par défaut sont sûres.
-- `vehicle_id` passe en NOT NULL (doc 12 §Order : `vehicleId String`) : une commande
-- sans véhicule n'a pas de sens (prix convenu, passage SOLD, suivi logistique).
ALTER TABLE public.orders ALTER COLUMN "vehicle_id" SET NOT NULL;
-- La FK doit suivre : M03 l'avait posée en ON DELETE SET NULL (colonne nullable à l'époque,
-- défaut Prisma pour une relation optionnelle). Relation devenue obligatoire => défaut Prisma
-- ON DELETE RESTRICT, qui est aussi la règle du corpus (doc 03 §18 : aucune suppression physique
-- d'un véhicule portant une commande).
ALTER TABLE "orders" DROP CONSTRAINT "orders_vehicle_id_fkey";
ALTER TABLE "orders" ADD CONSTRAINT "orders_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public.orders ADD COLUMN "lead_id" UUID;
ALTER TABLE public.orders ADD COLUMN "reservation_id" UUID;
ALTER TABLE public.orders ADD COLUMN "salesperson_id" UUID NOT NULL;
ALTER TABLE public.orders ADD COLUMN "agreed_transport_price" DECIMAL(14,2);
ALTER TABLE public.orders ADD COLUMN "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.orders ADD COLUMN "estimated_arrival_at" TIMESTAMP(3);
ALTER TABLE public.orders ADD COLUMN "delivered_at" TIMESTAMP(3);

ALTER TABLE "orders" ADD CONSTRAINT "orders_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_salesperson_id_fkey" FOREIGN KEY ("salesperson_id") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Index utile de parcours (aligné doc 12 §Order : @@index([vehicleId, status])).
CREATE INDEX "orders_vehicle_id_status_idx" ON "orders"("vehicle_id", "status");

-- Invariant corpus « une commande active maximum par véhicule » (BR-103) : index
-- unique PARTIEL (une commande annulée ne bloque pas une nouvelle vente du véhicule).
CREATE UNIQUE INDEX "orders_one_active_per_vehicle_idx"
  ON public.orders ("vehicle_id")
  WHERE status <> 'CANCELLED';

-- ----------------------------------------------------------------------------
-- 6. RLS et privilèges (contrat §2.6)
-- ----------------------------------------------------------------------------
-- Les quatre tables du lot ont la RLS ACTIVÉE (tout refus est un refus par défaut).
ALTER TABLE public.reservations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_logistics_events ENABLE ROW LEVEL SECURITY;

-- `reservations` : le client lit SES PROPRES lignes (via customer_id) ; aucune
-- écriture client. Le nouvel objet est d'abord purgé de tout privilège hérité
-- des privilèges par défaut Supabase, puis seul SELECT est accordé.
REVOKE ALL ON public.reservations FROM anon, authenticated;
GRANT SELECT ON public.reservations TO authenticated;

DROP POLICY IF EXISTS reservations_select_own ON public.reservations;
CREATE POLICY reservations_select_own ON public.reservations
  FOR SELECT TO authenticated
  USING (customer_id = public.current_customer_profile_id());

-- `orders` : lecture de ses propres lignes réaffirmée (la policy et le GRANT
-- existent déjà depuis M05 ; on les repose à l'identique pour que M08 soit
-- auto-suffisant, sans élargir le droit : toujours SELECT de ses lignes seules).
GRANT SELECT ON public.orders TO authenticated;

DROP POLICY IF EXISTS orders_select_own ON public.orders;
CREATE POLICY orders_select_own ON public.orders
  FOR SELECT TO authenticated
  USING (customer_id = public.current_customer_profile_id());

-- `order_events` (transitions de commande) et `vehicle_logistics_events`
-- (historique du véhicule) : ACCÈS SERVEUR UNIQUEMENT — aucun privilège client.
REVOKE ALL ON public.order_events             FROM anon, authenticated;
REVOKE ALL ON public.vehicle_logistics_events FROM anon, authenticated;
