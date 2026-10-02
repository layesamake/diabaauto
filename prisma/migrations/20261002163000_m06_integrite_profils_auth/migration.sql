-- ============================================================================
-- Diaba Auto - M06 : intégrité référentielle profiles <-> auth.users
--
-- Règle métier retenue : la suppression d'un compte client est INTERDITE tant qu'il porte
-- de l'activité (commandes notamment) — l'historique est conservé pour la comptabilité.
--
-- Cette règle était déjà largement en place dans le schéma :
--   * customer_profiles.profile_id -> profiles(id)          ON DELETE RESTRICT
--   * staff_profiles.profile_id    -> profiles(id)          ON DELETE RESTRICT
--   * orders.customer_id           -> customer_profiles(id) ON DELETE RESTRICT
--   * leads / custom_requests      -> customer_profiles(id) ON DELETE SET NULL (activité conservée)
--
-- Le trou : `profiles.auth_user_id` n'avait AUCUNE contrainte vers `auth.users`.
-- Supprimer un compte Auth contournait donc tous ces verrous et laissait un profil orphelin
-- (constaté en validation de bout en bout). M06 répare les orphelins hérités puis pose la
-- contrainte manquante : la base refuse désormais bruyamment toute suppression qui
-- laisserait des données derrière elle, au lieu de les perdre silencieusement.

-- ----------------------------------------------------------------------------
-- 1. Réparation des profils orphelins hérités
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE _orphelins AS
SELECT p.id AS profile_id, cp.id AS customer_id
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.auth_user_id
LEFT JOIN public.customer_profiles cp ON cp.profile_id = p.id
WHERE u.id IS NULL;

DO $$
DECLARE v integer;
BEGIN
  SELECT count(*) INTO v
  FROM public.orders o
  JOIN _orphelins x ON x.customer_id = o.customer_id;

  IF v > 0 THEN
    RAISE EXCEPTION
      'M06 : % commande(s) rattachée(s) à un profil orphelin — intervention manuelle requise avant migration.', v;
  END IF;
END $$;

DELETE FROM public.favorite_vehicles
 WHERE customer_id IN (SELECT customer_id FROM _orphelins WHERE customer_id IS NOT NULL);

DELETE FROM public.saved_searches
 WHERE customer_id IN (SELECT customer_id FROM _orphelins WHERE customer_id IS NOT NULL);

UPDATE public.leads           SET customer_id = NULL
 WHERE customer_id IN (SELECT customer_id FROM _orphelins WHERE customer_id IS NOT NULL);

UPDATE public.custom_requests SET customer_id = NULL
 WHERE customer_id IN (SELECT customer_id FROM _orphelins WHERE customer_id IS NOT NULL);

DELETE FROM public.audit_logs        WHERE actor_profile_id IN (SELECT profile_id FROM _orphelins);
DELETE FROM public.customer_profiles WHERE profile_id      IN (SELECT profile_id FROM _orphelins);
DELETE FROM public.staff_profiles    WHERE profile_id      IN (SELECT profile_id FROM _orphelins);
DELETE FROM public.profiles          WHERE id               IN (SELECT profile_id FROM _orphelins);

DROP TABLE _orphelins;

-- ----------------------------------------------------------------------------
-- 2. Contrainte manquante : un profil ne peut exister sans son compte Auth
-- ----------------------------------------------------------------------------
-- ON DELETE RESTRICT : la suppression d'un compte Auth portant un profil échoue
-- explicitement. Pour supprimer un compte, le personnel doit d'abord purger ses
-- dépendances, qui sont elles-mêmes protégées (orders -> RESTRICT).
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_auth_user_id_fkey
  FOREIGN KEY (auth_user_id) REFERENCES auth.users(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

COMMENT ON CONSTRAINT profiles_auth_user_id_fkey ON public.profiles IS
  'M06 : garantit qu''aucun profil ne survit à la suppression de son compte Auth. '
  'Suppression bloquée (RESTRICT) tant que le profil porte des dépendances protégées.';
