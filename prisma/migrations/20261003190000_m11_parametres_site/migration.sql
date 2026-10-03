-- ============================================================================
-- Diaba Auto - M11 : paramètres du site (coordonnées de contact modifiables)
-- ============================================================================
-- Migration ADDITIVE : une table, aucune donnée existante touchée, aucune dépendance de déploiement
-- avec le code (le code lit la table et retombe sur l'environnement si une valeur est absente).
--
-- Une seule ligne (id = 1, imposé par CHECK) : ce sont les réglages de TOUT le site, pas une liste.
-- Valeur NULL = non renseignée : l'application retombe alors sur la variable d'environnement, puis,
-- pour le numéro WhatsApp seulement, sur la valeur documentée (BR-120, doc 08).
--
-- Structure alignée sur la sortie de :
--   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script

-- CreateTable
CREATE TABLE "site_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "whatsapp_number" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "contact_address" TEXT,
    "contact_city" TEXT,
    "contact_country" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- ----------------------------------------------------------------------------
-- Complément manuel : contraintes que Prisma n'exprime pas
-- ----------------------------------------------------------------------------
-- Une seule ligne de réglages.
ALTER TABLE public.site_settings
  ADD CONSTRAINT site_settings_single_row CHECK (id = 1);

-- Numéro WhatsApp : format E.164 (+ puis 8 à 15 chiffres, sans espaces). Le lien wa.me est construit
-- depuis cette valeur : une valeur mal formée produirait un lien cassé.
ALTER TABLE public.site_settings
  ADD CONSTRAINT site_settings_whatsapp_e164
  CHECK (whatsapp_number IS NULL OR whatsapp_number ~ '^\+[1-9][0-9]{7,14}$');

-- Adresse e-mail : forme minimale (un @ entouré de texte, sans espace). La validation fine est faite
-- côté serveur ; ceci n'est que le filet de sécurité.
ALTER TABLE public.site_settings
  ADD CONSTRAINT site_settings_email_shape
  CHECK (contact_email IS NULL OR contact_email ~ '^[^@\s]+@[^@\s]+$');

-- La ligne unique, vide : toutes les valeurs retombent sur l'environnement tant qu'on n'a rien saisi.
INSERT INTO public.site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- RLS : lecture et écriture par le serveur uniquement
-- ----------------------------------------------------------------------------
-- Les coordonnées sont publiques par nature, mais la table n'est PAS ouverte à l'API publique : elle
-- n'est lue que par le serveur (connexion Prisma), qui décide de ce qu'il affiche. Aucune policy =
-- aucun accès pour `anon` et `authenticated`.
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_settings FROM anon, authenticated;
