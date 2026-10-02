-- ============================================================================
-- Diaba Auto - M01 : enums d'identité, profils, rôles et permissions
-- ============================================================================
-- Structure SQL générée par : npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
-- NE PAS éditer la partie générée à la main : régénérer depuis prisma/schema.prisma (décision T01).

CREATE TYPE "UserType" AS ENUM ('CUSTOMER', 'STAFF');

CREATE TYPE "ProfileStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

CREATE TYPE "PricingProfile" AS ENUM ('STANDARD', 'RESELLER');

CREATE TYPE "CustomerSegment" AS ENUM ('INDIVIDUAL', 'FLEET', 'GARAGE', 'OTHER');

CREATE TYPE "ResellerStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "auth_user_id" UUID NOT NULL,
    "user_type" "UserType" NOT NULL,
    "status" "ProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "preferred_locale" TEXT NOT NULL DEFAULT 'fr',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_profiles" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "pricing_profile" "PricingProfile" NOT NULL DEFAULT 'STANDARD',
    "customer_segment" "CustomerSegment" NOT NULL DEFAULT 'INDIVIDUAL',
    "reseller_status" "ResellerStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "whatsapp" TEXT,
    "country" TEXT NOT NULL DEFAULT 'SN',
    "city" TEXT,
    "company_name" TEXT,
    "business_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staff_profiles" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "job_title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staff_roles" (
    "staff_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "staff_roles_pkey" PRIMARY KEY ("staff_id","role_id")
);

CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

CREATE UNIQUE INDEX "profiles_auth_user_id_key" ON "profiles"("auth_user_id");

CREATE UNIQUE INDEX "customer_profiles_profile_id_key" ON "customer_profiles"("profile_id");

CREATE INDEX "customer_profiles_pricing_profile_reseller_status_idx" ON "customer_profiles"("pricing_profile", "reseller_status");

CREATE UNIQUE INDEX "staff_profiles_profile_id_key" ON "staff_profiles"("profile_id");

CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Extensions PostgreSQL
-- gen_random_uuid() est natif depuis PostgreSQL 13, mais pgcrypto est demandé par la décision T01
-- (déjà provisionné par Supabase dans le schéma « extensions » : l'instruction est idempotente).
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
