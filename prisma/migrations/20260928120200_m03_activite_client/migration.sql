-- ============================================================================
-- Diaba Auto - M03 : favoris, recherches enregistrées, prospects, demandes, commandes
-- ============================================================================
-- Structure SQL générée par : npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
-- NE PAS éditer la partie générée à la main : régénérer depuis prisma/schema.prisma (décision T01).

CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATION', 'ORDER_CONFIRMED', 'LOST', 'COMPLETED');

CREATE TYPE "RequestStatus" AS ENUM ('RECEIVED', 'QUALIFIED', 'SEARCHING', 'PROPOSED', 'CLOSED', 'ABANDONED');

CREATE TYPE "OrderStatus" AS ENUM ('CONFIRMED', 'PROCESSING', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'CANCELLED');

CREATE TABLE "favorite_vehicles" (
    "customer_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_vehicles_pkey" PRIMARY KEY ("customer_id","vehicle_id")
);

CREATE TABLE "saved_searches" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "criteria_json" JSONB NOT NULL,
    "notifications_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "customer_id" UUID,
    "vehicle_id" UUID,
    "assigned_salesperson_id" UUID,
    "first_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "custom_requests" (
    "id" UUID NOT NULL,
    "customer_id" UUID,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "criteria_json" JSONB NOT NULL,
    "budget_min" DECIMAL(14,2),
    "budget_max" DECIMAL(14,2),
    "status" "RequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "vehicle_id" UUID,
    "agreed_price" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "status" "OrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "saved_searches_customer_id_idx" ON "saved_searches"("customer_id");

CREATE INDEX "leads_status_assigned_salesperson_id_idx" ON "leads"("status", "assigned_salesperson_id");

CREATE INDEX "custom_requests_customer_id_status_idx" ON "custom_requests"("customer_id", "status");

CREATE UNIQUE INDEX "orders_reference_key" ON "orders"("reference");

CREATE INDEX "orders_customer_id_status_idx" ON "orders"("customer_id", "status");

ALTER TABLE "favorite_vehicles" ADD CONSTRAINT "favorite_vehicles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "favorite_vehicles" ADD CONSTRAINT "favorite_vehicles_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leads" ADD CONSTRAINT "leads_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_salesperson_id_fkey" FOREIGN KEY ("assigned_salesperson_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "custom_requests" ADD CONSTRAINT "custom_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
