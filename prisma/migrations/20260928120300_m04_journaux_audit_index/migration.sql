-- ============================================================================
-- Diaba Auto - M04 : journaux de commande (order_events), audit (audit_logs) et compléments manuels
-- ============================================================================
-- Structure SQL générée par : npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
-- NE PAS éditer la partie générée à la main : régénérer depuis prisma/schema.prisma (décision T01).

CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "note" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_profile_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_events_order_id_occurred_at_idx" ON "order_events"("order_id", "occurred_at");

CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Complément manuel M04 : contraintes CHECK (T04), index complémentaires (T06)
-- et audit append-only (T05). Objets non exprimables par Prisma.
-- Les noms de colonnes suivent le contrat canonique (snake_case, non quotés).
-- ============================================================================

-- Contraintes CHECK sur les montants (T04) ----------------------------------
-- ATTENTION : `vehicles` ne porte PLUS de colonne de prix (décision D10) —
-- `public_price`, `reseller_price` et `currency` ont migré vers `vehicle_prices`.
-- Les contrôles de montants portent donc sur les tables qui les détiennent.
ALTER TABLE public.vehicle_prices
  ADD CONSTRAINT "vehicle_prices_base_amount_non_negative" CHECK ("base_amount" >= 0),
  ADD CONSTRAINT "vehicle_prices_transport_amount_non_negative" CHECK ("transport_amount" IS NULL OR "transport_amount" >= 0),
  ADD CONSTRAINT "vehicle_prices_validity_range" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" >= "valid_from");

ALTER TABLE public.orders
  ADD CONSTRAINT "orders_agreed_price_non_negative" CHECK ("agreed_price" >= 0);

ALTER TABLE public.custom_requests
  ADD CONSTRAINT "custom_requests_budget_min_non_negative" CHECK ("budget_min" IS NULL OR "budget_min" >= 0),
  ADD CONSTRAINT "custom_requests_budget_max_non_negative" CHECK ("budget_max" IS NULL OR "budget_max" >= 0),
  ADD CONSTRAINT "custom_requests_budget_range" CHECK ("budget_min" IS NULL OR "budget_max" IS NULL OR "budget_min" <= "budget_max");

-- Index sur les clés étrangères non couvertes (T06) -------------------------
-- Les rôles du personnel sont désormais N:N : l'index porte sur staff_roles.
CREATE INDEX IF NOT EXISTS "staff_roles_role_id_idx" ON public.staff_roles (role_id);
CREATE INDEX IF NOT EXISTS "leads_customer_id_idx" ON public.leads (customer_id);
CREATE INDEX IF NOT EXISTS "leads_vehicle_id_idx" ON public.leads (vehicle_id);
CREATE INDEX IF NOT EXISTS "orders_vehicle_id_idx" ON public.orders (vehicle_id);
CREATE INDEX IF NOT EXISTS "custom_requests_customer_id_idx" ON public.custom_requests (customer_id);
CREATE INDEX IF NOT EXISTS "audit_logs_actor_profile_id_idx" ON public.audit_logs (actor_profile_id);

-- Index sur les clés étrangères des objets L2 non couvertes (T06) ------------
-- Les colonnes en tête des index uniques Prisma (brand_id+slug, model_id+name,
-- category_id+code, vehicle_id+display_order, vehicle_id+feature_definition_id,
-- vehicle_id+pricing_profile+is_active, vehicle_id+changed_at) sont déjà couvertes.
CREATE INDEX IF NOT EXISTS "vehicle_trims_generation_id_idx" ON public.vehicle_trims (generation_id);
CREATE INDEX IF NOT EXISTS "vehicles_generation_id_idx" ON public.vehicles (generation_id);
CREATE INDEX IF NOT EXISTS "vehicles_trim_id_idx" ON public.vehicles (trim_id);
CREATE INDEX IF NOT EXISTS "vehicles_fuel_type_id_idx" ON public.vehicles (fuel_type_id);
CREATE INDEX IF NOT EXISTS "vehicles_transmission_type_id_idx" ON public.vehicles (transmission_type_id);
CREATE INDEX IF NOT EXISTS "vehicles_body_type_id_idx" ON public.vehicles (body_type_id);
CREATE INDEX IF NOT EXISTS "vehicles_exterior_color_id_idx" ON public.vehicles (exterior_color_id);
CREATE INDEX IF NOT EXISTS "vehicles_interior_color_id_idx" ON public.vehicles (interior_color_id);
CREATE INDEX IF NOT EXISTS "vehicle_features_feature_definition_id_idx" ON public.vehicle_features (feature_definition_id);
CREATE INDEX IF NOT EXISTS "vehicle_options_option_id_idx" ON public.vehicle_options (option_id);

-- Index partiel catalogue (T06) --------------------------------------------
-- La publication (is_published) est distincte du statut commercial : le
-- catalogue public filtre donc sur is_published = true.
CREATE INDEX IF NOT EXISTS "vehicles_published_at_idx"
  ON public.vehicles (published_at DESC)
  WHERE is_published = true;

-- Audit append-only (T05) ---------------------------------------------------
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.audit_logs FROM anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs est append-only : operation % interdite', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS "audit_logs_append_only" ON public.audit_logs;
CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_mutation();
