-- ============================================================================
-- Diaba Auto - M13 : autoriser la page « Mentions légales et confidentialité »
-- ============================================================================
-- Migration ADDITIVE et NON STRUCTURELLE : elle ne modifie qu'une contrainte CHECK pour élargir la
-- liste des pages de contenu autorisées. Aucune table, colonne ni donnée n'est touchée. Sans
-- dépendance de déploiement : tant qu'elle n'est pas appliquée, la page publique affiche le texte
-- par défaut, mais l'enregistrement depuis le back-office échoue (CHECK). L'appliquer lève ce blocage.

ALTER TABLE public.site_pages DROP CONSTRAINT IF EXISTS site_pages_known_slug;
ALTER TABLE public.site_pages
  ADD CONSTRAINT site_pages_known_slug
  CHECK (slug IN ('a-propos', 'comment-ca-marche', 'mentions-legales'));
