-- ============================================================================
-- Diaba Auto - M05 : liaison auth.users, RLS, policies et buckets Storage
-- SQL entièrement manuel : ces objets ne sont pas exprimables par Prisma (T01).
--
-- Principes retenus (décisions T03/T05, docs 11 et 12) :
--   * RLS activée sur TOUTES les tables exposées du schéma « public ».
--     Aucune policy n'est créée par défaut : « aucune policy » = aucun accès
--     pour anon et authenticated (refus par défaut).
--   * Les tables de back-office (staff_profiles, staff_roles, roles,
--     permissions, role_permissions, audit_logs, order_events,
--     vehicle_documents, brands, vehicle_models) n'ont AUCUNE policy client :
--     leur lecture et leur écriture passent exclusivement par le serveur
--     (rôle service_role).
--   * Les référentiels du lot L2 (vehicle_generations, vehicle_trims, body_types,
--     fuel_types, transmission_types, colors, option_categories, options,
--     feature_definitions) et les tables de prix (vehicle_prices, exchange_rates,
--     price_history) ainsi que les associations de caractéristiques
--     (vehicle_features, vehicle_options) restent en REFUS PAR DÉFAUT : RLS
--     activée, AUCUNE policy client et AUCUN GRANT — le serveur seul les
--     lit/écrit (service_role).
--   * Les requêtes « lignes propres » s'appuient sur deux fonctions helper
--     SECURITY DEFINER STABLE, ce qui évite la récursion des policies sur
--     « profiles » et contourne RLS pour la seule jointure auth.uid().
--   * Aucune attribution de rôle (user_type/status/reseller_status) n'est
--     déductible des métadonnées éditables par l'utilisateur (T03).
--   * Nommage canonique : colonnes snake_case non quotées ; les rôles du
--     personnel sont N:N via staff_roles ; l'activité d'un membre du personnel
--     est portée par profiles.status (= 'ACTIVE').
-- ============================================================================

-- Extensions (idempotent) ----------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Fonctions utilitaires
-- ----------------------------------------------------------------------------

-- Profil métier (profiles.id) de l'utilisateur authentifié.
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id FROM public.profiles p WHERE p.auth_user_id = auth.uid()
$$;

-- Profil client (customer_profiles.id) de l'utilisateur authentifié.
CREATE OR REPLACE FUNCTION public.current_customer_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id
  FROM public.customer_profiles c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE p.auth_user_id = auth.uid()
$$;

-- Vrai si l'utilisateur authentifié est un membre du personnel actif portant le rôle ADMIN.
-- Les rôles sont N:N (staff_roles) et l'activité du personnel = profiles.status = 'ACTIVE'.
CREATE OR REPLACE FUNCTION public.current_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_profiles s
    JOIN public.profiles p ON p.id = s.profile_id
    JOIN public.staff_roles sr ON sr.staff_id = s.id
    JOIN public.roles r ON r.id = sr.role_id
    WHERE p.auth_user_id = auth.uid()
      AND p.status = 'ACTIVE'
      AND r.code = 'ADMIN'
  )
$$;

GRANT EXECUTE ON FUNCTION public.current_profile_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_customer_profile_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_is_admin() TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Liaison auth.users <-> profiles (T03) : trigger idempotent + réparation
-- ----------------------------------------------------------------------------

-- Création idempotente du profil métier à l'inscription.
-- IMPORTANT : user_type et status sont FIXÉS par cette fonction ('CUSTOMER',
-- 'ACTIVE') et ne sont JAMAIS lus depuis raw_user_meta_data, qui est éditable
-- par l'utilisateur (doc 11, dev.md §6). L'attribution STAFF/ADMIN est un acte
-- serveur séparé (commande d'amorçage, décision D04).
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id uuid;
  v_first text;
  v_last  text;
BEGIN
  INSERT INTO public.profiles (id, auth_user_id, user_type, status, preferred_locale, created_at, updated_at)
  VALUES (gen_random_uuid(), NEW.id, 'CUSTOMER', 'ACTIVE', 'fr', now(), now())
  ON CONFLICT (auth_user_id) DO NOTHING;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = NEW.id;
  IF v_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_first := COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'first_name'), ''), '');
  v_last  := COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'last_name'), ''), '');

  INSERT INTO public.customer_profiles (
    id, profile_id, pricing_profile, customer_segment, reseller_status,
    first_name, last_name, country, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), v_profile_id, 'STANDARD', 'INDIVIDUAL', 'NOT_APPLICABLE',
    v_first, v_last, 'SN', now(), now()
  )
  ON CONFLICT (profile_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- Réparation des comptes orphelins : profils absents pour un auth.users
-- existant, ou client sans customer_profiles. Idempotente ; renvoie le nombre
-- de profils créés. À exécuter hors ligne (opérateur/service_role).
CREATE OR REPLACE FUNCTION public.repair_orphan_profiles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_created integer := 0;
BEGIN
  INSERT INTO public.profiles (id, auth_user_id, user_type, status, preferred_locale, created_at, updated_at)
  SELECT gen_random_uuid(), u.id, 'CUSTOMER', 'ACTIVE', 'fr', now(), now()
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.auth_user_id = u.id
  WHERE p.id IS NULL
  ON CONFLICT (auth_user_id) DO NOTHING;
  GET DIAGNOSTICS v_created = ROW_COUNT;

  INSERT INTO public.customer_profiles (
    id, profile_id, pricing_profile, customer_segment, reseller_status,
    first_name, last_name, country, created_at, updated_at
  )
  SELECT gen_random_uuid(), p.id, 'STANDARD', 'INDIVIDUAL', 'NOT_APPLICABLE',
         '', '', 'SN', now(), now()
  FROM public.profiles p
  LEFT JOIN public.customer_profiles c ON c.profile_id = p.id
  WHERE p.user_type = 'CUSTOMER' AND c.id IS NULL
  ON CONFLICT (profile_id) DO NOTHING;

  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repair_orphan_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_orphan_profiles() TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Reprise explicite des privilèges (Supabase accorde de larges GRANT par défaut)
-- ----------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Activation de RLS sur toutes les tables (refus par défaut)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_models       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_generations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_trims        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_types           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_types           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transmission_types   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colors               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.option_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.options              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_definitions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_media        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_features     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_options      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_prices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_vehicles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_searches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs           ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 5. Catalogue public : véhicules publiés et médias publics (lecture seule)
--    La publication (is_published) est distincte du statut commercial :
--    c'est elle, et elle seule, qui gouverne l'accès public.
-- ----------------------------------------------------------------------------
-- GRANT SELECT colonne par colonne : les colonnes internes/serveur sont EXCLUES.
-- `vehicles` a migré ses prix vers `vehicle_prices` (décision D10) : il n'existe
-- donc plus de `public_price`/`reseller_price` sur cette table, et AUCUN tarif,
-- Standard ou Revendeur, ne peut plus être exposé par un GRANT sur `vehicles`.
-- Sont en revanche EXCLUES les colonnes de sourcing interne (fournisseur et
-- provenance) et l'éligibilité import, qui ne doivent jamais être servies au client :
--   supplier_reference, supplier_name, source_type, source_url, eligibility_status.
-- L'exigence du doc 07 §3 (« voir prix Revendeur : Non pour visiteur et Standard »)
-- et la menace « accès tarif Revendeur » du doc 17 §1 imposent qu'un prix Revendeur
-- ne soit jamais lisible par un client, même au travers de l'API PostgREST directe :
-- un `GRANT SELECT` global sur la table exposerait des colonnes malgré RLS (qui
-- filtre des lignes, pas des colonnes). Le contrôle T16 interdit donc tout
-- `GRANT SELECT` global sur `vehicles`. Les tarifs et les colonnes de sourcing ne
-- peuvent être servis que par le serveur (`service_role`).
GRANT SELECT (id, reference, slug, title, description, brand_id, model_id,
              generation_id, trim_id, condition, year, first_registration_date,
              mileage, previous_owners, accident_known, service_history_available,
              fuel_type_id, transmission_type_id, body_type_id, exterior_color_id,
              interior_color_id, power_kw, power_hp, engine_displacement, doors,
              seats, logistics_location, commercial_status, is_published, featured,
              published_at, archived_at, created_at, updated_at)
  ON public.vehicles TO anon, authenticated;
GRANT SELECT ON public.vehicle_media TO anon, authenticated;

CREATE POLICY vehicles_select_published ON public.vehicles
  FOR SELECT TO anon, authenticated
  USING (is_published = true);

-- Le média n'est lisible que s'il est PUBLIC et rattaché à une fiche publiée.
CREATE POLICY vehicle_media_select_published ON public.vehicle_media
  FOR SELECT TO anon, authenticated
  USING (
    visibility = 'PUBLIC'
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_media.vehicle_id AND v.is_published = true
    )
  );

-- NOTE : « brands », « vehicle_models », « vehicle_generations », « vehicle_trims »,
-- « body_types », « fuel_types », « transmission_types », « colors »,
-- « option_categories », « options » et « feature_definitions » ne reçoivent
-- volontairement AUCUNE policy de lecture (non listés dans le périmètre autorisé).
-- Il en va de même des tables d'association « vehicle_features » et
-- « vehicle_options », des tables de prix « vehicle_prices », « exchange_rates » et
-- « price_history », et de « vehicle_documents ». Toutes sont en REFUS PAR DÉFAUT :
-- RLS activée et aucune policy, donc aucun accès pour anon/authenticated. Le
-- catalogue les référence via le serveur (rôle service_role), qui seul lit et
-- écrit ces référentiels, ces associations et ces montants. Une policy SELECT
-- devra être ajoutée par décision explicite si un accès direct depuis le client
-- est requis (et un GRANT colonne par colonne, jamais un GRANT global, pour tout
-- objet portant des colonnes internes).

-- ----------------------------------------------------------------------------
-- 6. Profil et profil client : lecture de sa ligne, mise à jour de sa ligne
--    limitée par des GRANT de colonnes (user_type, status, reseller_status protégés)
-- ----------------------------------------------------------------------------
GRANT SELECT ON public.profiles TO authenticated;
-- profiles ne porte aucune colonne modifiable par le client : aucun GRANT UPDATE
-- n'est accordé (user_type et status sont des champs serveur).
GRANT SELECT ON public.customer_profiles TO authenticated;
-- Mise à jour colonne par colonne : profile_id, pricing_profile, customer_segment
-- et reseller_status sont exclus (champs serveur).
GRANT UPDATE (first_name, last_name, phone, whatsapp, country, city, company_name, business_type)
  ON public.customer_profiles TO authenticated;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = public.current_profile_id());

CREATE POLICY customer_profiles_select_own ON public.customer_profiles
  FOR SELECT TO authenticated
  USING (profile_id = public.current_profile_id());

CREATE POLICY customer_profiles_update_own ON public.customer_profiles
  FOR UPDATE TO authenticated
  USING (profile_id = public.current_profile_id())
  WITH CHECK (profile_id = public.current_profile_id());

-- ----------------------------------------------------------------------------
-- 7. Favoris et recherches enregistrées : CRUD de ses propres lignes
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_vehicles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_searches    TO authenticated;

CREATE POLICY favorite_vehicles_select_own ON public.favorite_vehicles
  FOR SELECT TO authenticated
  USING (customer_id = public.current_customer_profile_id());
CREATE POLICY favorite_vehicles_insert_own ON public.favorite_vehicles
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = public.current_customer_profile_id());
CREATE POLICY favorite_vehicles_update_own ON public.favorite_vehicles
  FOR UPDATE TO authenticated
  USING (customer_id = public.current_customer_profile_id())
  WITH CHECK (customer_id = public.current_customer_profile_id());
CREATE POLICY favorite_vehicles_delete_own ON public.favorite_vehicles
  FOR DELETE TO authenticated
  USING (customer_id = public.current_customer_profile_id());

CREATE POLICY saved_searches_select_own ON public.saved_searches
  FOR SELECT TO authenticated
  USING (customer_id = public.current_customer_profile_id());
CREATE POLICY saved_searches_insert_own ON public.saved_searches
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = public.current_customer_profile_id());
CREATE POLICY saved_searches_update_own ON public.saved_searches
  FOR UPDATE TO authenticated
  USING (customer_id = public.current_customer_profile_id())
  WITH CHECK (customer_id = public.current_customer_profile_id());
CREATE POLICY saved_searches_delete_own ON public.saved_searches
  FOR DELETE TO authenticated
  USING (customer_id = public.current_customer_profile_id());

-- ----------------------------------------------------------------------------
-- 8. Prospects, commandes et demandes : LECTURE de ses propres lignes uniquement.
--    Aucune policy INSERT/UPDATE/DELETE client : l'écriture passe par le serveur
--    (enveloppe de service, doc 10 / dev.md §6).
-- ----------------------------------------------------------------------------
GRANT SELECT ON public.leads           TO authenticated;
GRANT SELECT ON public.orders          TO authenticated;
GRANT SELECT ON public.custom_requests TO authenticated;

CREATE POLICY leads_select_own ON public.leads
  FOR SELECT TO authenticated
  USING (customer_id IS NOT NULL AND customer_id = public.current_customer_profile_id());

CREATE POLICY orders_select_own ON public.orders
  FOR SELECT TO authenticated
  USING (customer_id = public.current_customer_profile_id());

CREATE POLICY custom_requests_select_own ON public.custom_requests
  FOR SELECT TO authenticated
  USING (customer_id IS NOT NULL AND customer_id = public.current_customer_profile_id());

-- NOTE : « order_events », « staff_profiles », « staff_roles », « roles »,
-- « permissions » et « role_permissions » sont en refus par défaut (RLS
-- activée, aucune policy) : journaux, RBAC et pièces privées sont servis
-- uniquement par le serveur (décision T09).

-- ----------------------------------------------------------------------------
-- 9. Buckets Storage (doc 11, doc 13 M05)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('vehicle-images',    'vehicle-images',    true,  NULL, NULL),
  ('vehicle-documents', 'vehicle-documents', false, NULL, NULL),
  ('avatars',           'avatars',           false, NULL, NULL),
  ('app-assets',        'app-assets',        false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- LIMITE CONNUE DU BUCKET vehicle-images (« public = true ») :
-- un bucket marqué public expose TOUS ses objets en lecture anonyme via l'URL
-- /storage/v1/object/public/vehicle-images/... , SANS passer par RLS. Les
-- policies ci-dessous ne gouvernent donc que l'accès via l'API Storage
-- authentifiée. L'exigence « variantes publiées uniquement » n'est garantie
-- que si les images sont servies par URL signée / proxy serveur. Si la
-- garantie au niveau du stockage est exigée, basculer ce bucket en
-- « public = false » par migration (l'application ne doit alors consommer que
-- des URL signées).
CREATE POLICY storage_vehicle_media_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'vehicle-images'
    AND EXISTS (
      SELECT 1
      FROM public.vehicle_media vm
      JOIN public.vehicles v ON v.id = vm.vehicle_id
      WHERE vm.storage_path = storage.objects.name
        AND vm.visibility = 'PUBLIC'
        AND v.is_published = true
    )
  );

-- vehicle-documents : privé, aucune policy client (URL signées côté serveur,
-- durée paramétrée par STORAGE_SIGNED_URL_TTL_SECONDS, décision T09).

-- avatars : privé, propriétaire uniquement, convention de chemin <auth_uid>/...
CREATE POLICY storage_avatars_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY storage_avatars_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY storage_avatars_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY storage_avatars_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- app-assets : privé, écriture réservée aux administrateurs (rôle ADMIN actif).
-- Les privilèges de table sur storage.objects sont fournis par Supabase ; ce sont
-- les policies ci-dessous (RLS active par défaut sur storage.objects) qui bornent
-- l'accès. Aucun GRANT large n'est ajouté ici : seules les policies autorisent.
CREATE POLICY storage_app_assets_select_admin ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'app-assets' AND public.current_is_admin());
CREATE POLICY storage_app_assets_insert_admin ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'app-assets' AND public.current_is_admin());
CREATE POLICY storage_app_assets_update_admin ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'app-assets' AND public.current_is_admin())
  WITH CHECK (bucket_id = 'app-assets' AND public.current_is_admin());
CREATE POLICY storage_app_assets_delete_admin ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'app-assets' AND public.current_is_admin());