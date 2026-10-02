-- ============================================================================
-- Diaba Auto - M07 : CRM (prospects, notes, activités) et demandes Revendeur
-- ============================================================================
-- Migration ADDITIVE (contrat lot 5 §2). Les migrations M01..M06 sont déjà
-- appliquées sur la base réelle : AUCUNE n'est modifiée ici.
--
-- Renommages explicitement portés par cette migration (sans perte) :
--   * table   custom_requests            -> custom_vehicle_requests
--   * colonne leads.first_name           -> leads.name
-- PostgreSQL attache les policies RLS et les GRANT à l'OID de la table : le
-- renommage de `custom_requests` conserve donc EXACTEMENT ses privilèges
-- (contrat lot 5 §2.4). Le renommage de `leads.first_name` ne touche aucun
-- index ni contrainte (aucun ne portait sur cette colonne).
--
-- `leads` est vide (aucun prospect n'a jamais été écrit) : les colonnes NOT NULL
-- ajoutées sans valeur par défaut sont donc acceptables (contrat lot 5 §2.1).
-- Champs de structure alignés sur la sortie de :
--   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script

-- ----------------------------------------------------------------------------
-- 1. Enums (contrat §2.2)
-- ----------------------------------------------------------------------------
CREATE TYPE "ResellerApplicationStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TYPE "LeadActivityType" AS ENUM ('CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'STATUS_CHANGE');

-- ----------------------------------------------------------------------------
-- 2. `leads` — alignement doc 03 §11 (renommage de colonne puis ajouts)
-- ----------------------------------------------------------------------------
ALTER TABLE public.leads RENAME COLUMN "first_name" TO "name";

ALTER TABLE public.leads ADD COLUMN "reference" TEXT NOT NULL;
ALTER TABLE public.leads ADD COLUMN "whatsapp" TEXT;
ALTER TABLE public.leads ADD COLUMN "email" TEXT;
ALTER TABLE public.leads ADD COLUMN "source" TEXT;
ALTER TABLE public.leads ADD COLUMN "budget_min" DECIMAL(14,2);
ALTER TABLE public.leads ADD COLUMN "budget_max" DECIMAL(14,2);
ALTER TABLE public.leads ADD COLUMN "next_follow_up_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "leads_reference_key" ON "leads"("reference");

-- Contraintes CHECK des montants, même convention que T04 (non exprimables par Prisma).
ALTER TABLE public.leads
  ADD CONSTRAINT "leads_budget_min_non_negative" CHECK ("budget_min" IS NULL OR "budget_min" >= 0),
  ADD CONSTRAINT "leads_budget_max_non_negative" CHECK ("budget_max" IS NULL OR "budget_max" >= 0),
  ADD CONSTRAINT "leads_budget_range" CHECK ("budget_min" IS NULL OR "budget_max" IS NULL OR "budget_min" <= "budget_max");

-- ----------------------------------------------------------------------------
-- 3. `custom_requests` -> `custom_vehicle_requests` (contrat §2.3)
-- ----------------------------------------------------------------------------
ALTER TABLE public.custom_requests RENAME TO custom_vehicle_requests;

-- Alignement des noms d'objets sur le schéma Prisma (pkey, index, FK, CHECK).
-- Le renommage ne fait que renommer : aucune donnée, policy ou privilège n'est perdu.
ALTER TABLE public.custom_vehicle_requests RENAME CONSTRAINT "custom_requests_pkey" TO "custom_vehicle_requests_pkey";
ALTER TABLE public.custom_vehicle_requests RENAME CONSTRAINT "custom_requests_customer_id_fkey" TO "custom_vehicle_requests_customer_id_fkey";
ALTER TABLE public.custom_vehicle_requests RENAME CONSTRAINT "custom_requests_budget_min_non_negative" TO "custom_vehicle_requests_budget_min_non_negative";
ALTER TABLE public.custom_vehicle_requests RENAME CONSTRAINT "custom_requests_budget_max_non_negative" TO "custom_vehicle_requests_budget_max_non_negative";
ALTER TABLE public.custom_vehicle_requests RENAME CONSTRAINT "custom_requests_budget_range" TO "custom_vehicle_requests_budget_range";
ALTER INDEX public."custom_requests_customer_id_status_idx" RENAME TO "custom_vehicle_requests_customer_id_status_idx";
ALTER INDEX public."custom_requests_customer_id_idx" RENAME TO "custom_vehicle_requests_customer_id_idx";

-- Rattachement au prospect et champs demandés (doc 03 §11).
ALTER TABLE public.custom_vehicle_requests ADD COLUMN "lead_id" UUID;
ALTER TABLE public.custom_vehicle_requests ADD COLUMN "requested_brand" TEXT;
ALTER TABLE public.custom_vehicle_requests ADD COLUMN "requested_model" TEXT;
ALTER TABLE public.custom_vehicle_requests ADD COLUMN "year_min" INTEGER;
ALTER TABLE public.custom_vehicle_requests ADD COLUMN "year_max" INTEGER;

ALTER TABLE public.custom_vehicle_requests
  ADD CONSTRAINT "custom_vehicle_requests_year_range" CHECK ("year_min" IS NULL OR "year_max" IS NULL OR "year_min" <= "year_max");

ALTER TABLE "custom_vehicle_requests" ADD CONSTRAINT "custom_vehicle_requests_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index de clé étrangère non couvert (convention T06).
CREATE INDEX IF NOT EXISTS "custom_vehicle_requests_lead_id_idx" ON public.custom_vehicle_requests ("lead_id");

-- ----------------------------------------------------------------------------
-- 4. Nouvelles tables (contrat §2.2) — structure générée depuis le schéma
-- ----------------------------------------------------------------------------
CREATE TABLE "reseller_applications" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "company_name" TEXT NOT NULL,
    "business_type" TEXT,
    "estimated_volume" TEXT,
    "status" "ResellerApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reseller_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lead_notes" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lead_activities" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "type" "LeadActivityType" NOT NULL,
    "description" TEXT NOT NULL,
    "performed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reseller_applications_status_idx" ON "reseller_applications"("status");

CREATE INDEX "lead_notes_lead_id_created_at_idx" ON "lead_notes"("lead_id", "created_at");

CREATE INDEX "lead_activities_lead_id_created_at_idx" ON "lead_activities"("lead_id", "created_at");

-- Invariant corpus « une demande ouverte maximum » : index unique PARTIEL
-- (impossible à exprimer en Prisma, d'où sa présence ici).
CREATE UNIQUE INDEX "reseller_applications_one_open_per_customer_idx"
  ON public.reseller_applications ("customer_id")
  WHERE status IN ('PENDING', 'UNDER_REVIEW');

ALTER TABLE "reseller_applications" ADD CONSTRAINT "reseller_applications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reseller_applications" ADD CONSTRAINT "reseller_applications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 5. RLS et privilèges (contrat §2.4)
-- ----------------------------------------------------------------------------
-- Les 4 nouvelles/renommées tables ont la RLS ACTIVÉE (refus par défaut).
ALTER TABLE public.leads                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_vehicle_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_applications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities         ENABLE ROW LEVEL SECURITY;

-- `leads` passe en accès serveur UNIQUEMENT (le portail My Diaba Auto ne l'expose
-- plus) : la policy et le GRANT posés par M05 sont retirés. `lead_notes`,
-- `lead_activities` et `reseller_applications` n'ont AUCUN privilège client.
DROP POLICY IF EXISTS leads_select_own ON public.leads;
REVOKE ALL ON public.leads             FROM anon, authenticated;
REVOKE ALL ON public.lead_notes        FROM anon, authenticated;
REVOKE ALL ON public.lead_activities   FROM anon, authenticated;
REVOKE ALL ON public.reseller_applications FROM anon, authenticated;

-- `custom_vehicle_requests` conserve EXACTEMENT les privilèges de `custom_requests`
-- (le client lit la sienne via `customer_id`) : le renommage les a préservés, on ne
-- touche ni au GRANT SELECT ni à la policy `custom_requests_select_own`.
