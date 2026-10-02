import type { DependentOption, VehicleReferentialOptions } from "@/components/admin/VehicleForm";
import type { SelectOption } from "@/components/admin/admin-view";
import { listPublicReferenceValues, type ReferentialRow } from "@/services/referential.service";

/**
 * Options de référentiel des formulaires véhicule.
 *
 * `listPublicReferenceValues` est la lecture restreinte aux éléments non désactivés (doc 03 §5) :
 * elle n'exige aucune permission et ne projette aucun champ d'administration. Elle convient donc au
 * remplissage des listes déroulantes, y compris pour un membre du personnel qui ne gère pas les
 * référentiels. L'écran d'administration des référentiels utilise, lui, `listReferential` (qui exige
 * `content.manage`).
 */

function toOption(row: ReferentialRow): SelectOption {
  return { value: row.id, label: row.name };
}

function toDependentOption(row: ReferentialRow): DependentOption {
  return { value: row.id, label: row.name, parentId: row.parentId };
}

export async function loadVehicleReferentialOptions(): Promise<VehicleReferentialOptions> {
  const [brands, models, generations, trims, fuelTypes, transmissionTypes, bodyTypes, colors] = await Promise.all([
    listPublicReferenceValues("brand"),
    listPublicReferenceValues("vehicleModel"),
    listPublicReferenceValues("generation"),
    listPublicReferenceValues("trim"),
    listPublicReferenceValues("fuelType"),
    listPublicReferenceValues("transmissionType"),
    listPublicReferenceValues("bodyType"),
    listPublicReferenceValues("color"),
  ]);

  return {
    brands: brands.map(toOption),
    models: models.map(toDependentOption),
    generations: generations.map(toDependentOption),
    trims: trims.map(toDependentOption),
    fuelTypes: fuelTypes.map(toOption),
    transmissionTypes: transmissionTypes.map(toOption),
    bodyTypes: bodyTypes.map(toOption),
    colors: colors.map(toOption),
  };
}
