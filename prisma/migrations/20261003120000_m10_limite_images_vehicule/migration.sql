-- ============================================================================
-- Diaba Auto - M10 : au plus 5 images par véhicule (garantie au niveau base)
-- ============================================================================
-- Le service applicatif (`addMedia`) refuse déjà une 6e image, sous verrou de la ligne du véhicule.
-- Cette migration ajoute le filet de sécurité final : même un appel direct, un script ou un futur
-- chemin de code ne peut pas dépasser la limite.
--
-- Fonctionnement : un déclencheur BEFORE INSERT verrouille la ligne du véhicule (SELECT … FOR UPDATE),
-- ce qui sérialise les insertions concurrentes d'un même véhicule, puis compte les images existantes.
-- Seules les IMAGES sont comptées : les vidéos externes restent hors quota.
--
-- Les véhicules qui comptent DÉJÀ plus de 5 images ne sont pas modifiés : le déclencheur ne porte que
-- sur les nouvelles insertions. Aucune suppression de données.
--
-- Constante dupliquée : 5 = MAX_IMAGES_PER_VEHICLE (lib/media-constants.ts). Modifier les deux
-- ensemble (nouvelle migration pour remplacer la fonction).
--
-- Idempotente (CREATE OR REPLACE / DROP TRIGGER IF EXISTS).
CREATE OR REPLACE FUNCTION public.enforce_vehicle_media_image_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  image_count integer;
BEGIN
  IF NEW.media_type <> 'IMAGE' THEN
    RETURN NEW;
  END IF;

  -- Sérialise les ajouts concurrents sur le même véhicule.
  PERFORM 1 FROM public.vehicles WHERE id = NEW.vehicle_id FOR UPDATE;

  SELECT count(*) INTO image_count
  FROM public.vehicle_media
  WHERE vehicle_id = NEW.vehicle_id AND media_type = 'IMAGE';

  IF image_count >= 5 THEN
    RAISE EXCEPTION 'Limite de 5 images par véhicule atteinte (vehicle_id=%)', NEW.vehicle_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicle_media_image_limit ON public.vehicle_media;

CREATE TRIGGER trg_vehicle_media_image_limit
  BEFORE INSERT ON public.vehicle_media
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_vehicle_media_image_limit();
