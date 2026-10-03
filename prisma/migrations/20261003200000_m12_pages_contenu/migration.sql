-- ============================================================================
-- Diaba Auto - M12 : pages de contenu modifiables (À propos, Comment ça marche)
-- ============================================================================
-- Migration ADDITIVE : une table, aucune donnée existante touchée, aucune dépendance de déploiement
-- avec le code. Aucune ligne n'est insérée : tant qu'une page n'a pas été enregistrée depuis le
-- back-office, le site affiche le texte par défaut défini dans le code.
--
-- Structure alignée sur la sortie de :
--   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script

-- CreateTable
CREATE TABLE "site_pages" (
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_pages_pkey" PRIMARY KEY ("slug")
);

-- ----------------------------------------------------------------------------
-- Complément manuel : contraintes que Prisma n'exprime pas
-- ----------------------------------------------------------------------------
-- Seules les pages connues de l'application peuvent exister (ajouter une page = nouvelle migration).
ALTER TABLE public.site_pages
  ADD CONSTRAINT site_pages_known_slug CHECK (slug IN ('a-propos', 'comment-ca-marche'));

-- Bornes de longueur : filet de sécurité ; la validation fine est faite côté serveur.
ALTER TABLE public.site_pages
  ADD CONSTRAINT site_pages_title_length CHECK (char_length(title) BETWEEN 1 AND 120);
ALTER TABLE public.site_pages
  ADD CONSTRAINT site_pages_body_length CHECK (char_length(body) BETWEEN 1 AND 20000);

-- ----------------------------------------------------------------------------
-- RLS : lecture et écriture par le serveur uniquement
-- ----------------------------------------------------------------------------
-- Le contenu est public une fois affiché, mais la table n'est PAS ouverte à l'API publique : elle
-- n'est lue que par le serveur (connexion Prisma). Aucune policy = aucun accès pour `anon` et
-- `authenticated`.
ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_pages FROM anon, authenticated;
