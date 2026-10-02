-- ============================================================================
-- Diaba Auto - M02 : référentiels automobiles, véhicule complet, médias, documents et prix
-- ============================================================================
-- Structure SQL générée par : npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
-- NE PAS éditer la partie générée à la main : régénérer depuis prisma/schema.prisma (décision T01).
-- Lot L2 (docs 03 §5/§6/§7/§9, docs 12 et 15) : référentiels auto, véhicule, médias, tables de prix.
-- Ordre respecté : enums -> référentiels (dépendances) -> véhicule -> médias/documents ->
-- associations N:N -> prix (dépend de vehicles) -> index -> clés étrangères.
-- Les colonnes de prix de `vehicles` (public_price/reseller_price/currency) et `location`
-- ont été remplacées par la table `vehicle_prices` et la colonne `logistics_location`
-- (décision D10) : ces colonnes n'existent plus.

CREATE TYPE "VehicleCondition" AS ENUM ('NEW', 'USED');

CREATE TYPE "LogisticsLocation" AS ENUM ('CHINA', 'IN_TRANSIT', 'SENEGAL');

CREATE TYPE "VehicleCommercialStatus" AS ENUM ('DRAFT', 'AVAILABLE', 'RESERVED', 'SOLD', 'UNAVAILABLE', 'ARCHIVED');

CREATE TYPE "EligibilityStatus" AS ENUM ('NOT_CHECKED', 'ELIGIBLE', 'NOT_ELIGIBLE', 'REVIEW_REQUIRED');

CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

CREATE TYPE "PriceType" AS ENUM ('REGULAR', 'PROMOTIONAL');

CREATE TYPE "DocumentVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'SHARE_ON_REQUEST');

CREATE TYPE "FeatureDataType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'JSON');

CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "country_of_origin" TEXT,
    "logo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicle_models" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicle_generations" (
    "id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_year" INTEGER,
    "end_year" INTEGER,

    CONSTRAINT "vehicle_generations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicle_trims" (
    "id" UUID NOT NULL,
    "generation_id" UUID,
    "model_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,

    CONSTRAINT "vehicle_trims_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "body_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "body_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fuel_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "fuel_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transmission_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "transmission_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "colors" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hex_code" TEXT,
    "scope" TEXT,

    CONSTRAINT "colors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "option_categories" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "option_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "options" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "feature_definitions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data_type" "FeatureDataType" NOT NULL,
    "unit" TEXT,
    "category" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "is_filterable" BOOLEAN NOT NULL DEFAULT false,
    "applicability" TEXT,

    CONSTRAINT "feature_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "brand_id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "generation_id" UUID,
    "trim_id" UUID,
    "condition" "VehicleCondition" NOT NULL,
    "year" INTEGER NOT NULL,
    "first_registration_date" DATE,
    "mileage" INTEGER,
    "previous_owners" INTEGER,
    "accident_known" BOOLEAN,
    "service_history_available" BOOLEAN,
    "fuel_type_id" UUID NOT NULL,
    "transmission_type_id" UUID NOT NULL,
    "body_type_id" UUID NOT NULL,
    "exterior_color_id" UUID,
    "interior_color_id" UUID,
    "power_kw" DECIMAL(10,2),
    "power_hp" DECIMAL(10,2),
    "engine_displacement" INTEGER,
    "doors" INTEGER,
    "seats" INTEGER,
    "supplier_reference" TEXT,
    "supplier_name" TEXT,
    "source_type" TEXT,
    "source_url" TEXT,
    "logistics_location" "LogisticsLocation" NOT NULL,
    "commercial_status" "VehicleCommercialStatus" NOT NULL DEFAULT 'DRAFT',
    "eligibility_status" "EligibilityStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicle_media" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "media_type" "MediaType" NOT NULL,
    "storage_path" TEXT,
    "external_url" TEXT,
    "thumbnail_path" TEXT,
    "category" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'PUBLIC',

    CONSTRAINT "vehicle_media_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicle_documents" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'PRIVATE',

    CONSTRAINT "vehicle_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicle_features" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "feature_definition_id" UUID NOT NULL,
    "value_text" TEXT,
    "value_number" DECIMAL(14,4),
    "value_bool" BOOLEAN,
    "value_date" DATE,
    "value_json" JSONB,

    CONSTRAINT "vehicle_features_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicle_options" (
    "vehicle_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,

    CONSTRAINT "vehicle_options_pkey" PRIMARY KEY ("vehicle_id","option_id")
);

CREATE TABLE "vehicle_prices" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "pricing_profile" "PricingProfile" NOT NULL,
    "price_type" "PriceType" NOT NULL DEFAULT 'REGULAR',
    "base_amount" DECIMAL(18,2) NOT NULL,
    "transport_amount" DECIMAL(18,2),
    "currency" VARCHAR(3) NOT NULL,
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_prices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "base_currency" VARCHAR(3) NOT NULL,
    "quote_currency" VARCHAR(3) NOT NULL,
    "rate" DECIMAL(20,8) NOT NULL,
    "source" TEXT NOT NULL,
    "effective_at" TIMESTAMP(3) NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "price_history" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "pricing_profile" "PricingProfile" NOT NULL,
    "component" TEXT NOT NULL,
    "old_amount" DECIMAL(18,2),
    "new_amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

CREATE UNIQUE INDEX "vehicle_models_brand_id_slug_key" ON "vehicle_models"("brand_id", "slug");

CREATE UNIQUE INDEX "vehicle_generations_model_id_name_key" ON "vehicle_generations"("model_id", "name");

CREATE UNIQUE INDEX "vehicle_trims_model_id_name_key" ON "vehicle_trims"("model_id", "name");

CREATE UNIQUE INDEX "body_types_code_key" ON "body_types"("code");

CREATE UNIQUE INDEX "fuel_types_code_key" ON "fuel_types"("code");

CREATE UNIQUE INDEX "transmission_types_code_key" ON "transmission_types"("code");

CREATE UNIQUE INDEX "colors_code_key" ON "colors"("code");

CREATE UNIQUE INDEX "option_categories_code_key" ON "option_categories"("code");

CREATE UNIQUE INDEX "options_category_id_code_key" ON "options"("category_id", "code");

CREATE UNIQUE INDEX "feature_definitions_code_key" ON "feature_definitions"("code");

CREATE UNIQUE INDEX "vehicles_reference_key" ON "vehicles"("reference");

CREATE UNIQUE INDEX "vehicles_slug_key" ON "vehicles"("slug");

CREATE INDEX "vehicles_brand_id_model_id_year_idx" ON "vehicles"("brand_id", "model_id", "year");

CREATE INDEX "vehicles_commercial_status_logistics_location_created_at_idx" ON "vehicles"("commercial_status", "logistics_location", "created_at");

CREATE INDEX "vehicles_condition_year_mileage_idx" ON "vehicles"("condition", "year", "mileage");

CREATE UNIQUE INDEX "vehicle_media_storage_path_key" ON "vehicle_media"("storage_path");

CREATE INDEX "vehicle_media_vehicle_id_display_order_idx" ON "vehicle_media"("vehicle_id", "display_order");

CREATE UNIQUE INDEX "vehicle_documents_storage_path_key" ON "vehicle_documents"("storage_path");

CREATE INDEX "vehicle_documents_vehicle_id_idx" ON "vehicle_documents"("vehicle_id");

CREATE UNIQUE INDEX "vehicle_features_vehicle_id_feature_definition_id_key" ON "vehicle_features"("vehicle_id", "feature_definition_id");

CREATE INDEX "vehicle_prices_vehicle_id_pricing_profile_is_active_idx" ON "vehicle_prices"("vehicle_id", "pricing_profile", "is_active");

CREATE INDEX "exchange_rates_base_currency_quote_currency_is_current_idx" ON "exchange_rates"("base_currency", "quote_currency", "is_current");

CREATE INDEX "price_history_vehicle_id_changed_at_idx" ON "price_history"("vehicle_id", "changed_at");

ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_generations" ADD CONSTRAINT "vehicle_generations_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_trims" ADD CONSTRAINT "vehicle_trims_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "vehicle_generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_trims" ADD CONSTRAINT "vehicle_trims_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "options" ADD CONSTRAINT "options_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "option_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "vehicle_generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_trim_id_fkey" FOREIGN KEY ("trim_id") REFERENCES "vehicle_trims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_fuel_type_id_fkey" FOREIGN KEY ("fuel_type_id") REFERENCES "fuel_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_transmission_type_id_fkey" FOREIGN KEY ("transmission_type_id") REFERENCES "transmission_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_body_type_id_fkey" FOREIGN KEY ("body_type_id") REFERENCES "body_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_exterior_color_id_fkey" FOREIGN KEY ("exterior_color_id") REFERENCES "colors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_interior_color_id_fkey" FOREIGN KEY ("interior_color_id") REFERENCES "colors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_media" ADD CONSTRAINT "vehicle_media_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_features" ADD CONSTRAINT "vehicle_features_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_features" ADD CONSTRAINT "vehicle_features_feature_definition_id_fkey" FOREIGN KEY ("feature_definition_id") REFERENCES "feature_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_options" ADD CONSTRAINT "vehicle_options_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_options" ADD CONSTRAINT "vehicle_options_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_prices" ADD CONSTRAINT "vehicle_prices_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "price_history" ADD CONSTRAINT "price_history_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
