import type { ReferentialKind } from "@/services/referential.service";

/**
 * Regroupement des référentiels pour l'écran « Marques et modèles ».
 *
 * Onze pastilles de même rang forçaient à connaître le vocabulaire du modèle de données. Elles sont
 * ici rangées selon la question que se pose celui qui les règle : « quelle voiture ? », « quelles
 * caractéristiques ? », « quels équipements ? ». Le test vérifie que chaque référentiel figure dans
 * exactement un groupe : un référentiel ajouté sans groupe disparaîtrait de l'écran.
 */

export type ReferentialGroup = {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly kinds: readonly ReferentialKind[];
};

export const REFERENTIAL_GROUPS: readonly ReferentialGroup[] = [
  {
    key: "voitures",
    label: "Marques et modèles",
    hint: "Ce qui identifie une voiture dans le catalogue.",
    kinds: ["brand", "vehicleModel", "generation", "trim"],
  },
  {
    key: "caracteristiques",
    label: "Caractéristiques",
    hint: "Les choix proposés dans la fiche d'un véhicule.",
    kinds: ["bodyType", "fuelType", "transmissionType", "color", "featureDefinition"],
  },
  {
    key: "equipements",
    label: "Équipements",
    hint: "Les options listées sur une fiche.",
    kinds: ["optionCategory", "option"],
  },
];

/** Libellé au pluriel, tel qu'on le lit sur une pastille qui ouvre une liste. */
export const REFERENTIAL_PLURAL_LABELS: Readonly<Record<ReferentialKind, string>> = {
  brand: "Marques",
  vehicleModel: "Modèles",
  generation: "Générations",
  trim: "Finitions",
  bodyType: "Carrosseries",
  fuelType: "Énergies",
  transmissionType: "Boîtes de vitesses",
  color: "Couleurs",
  featureDefinition: "Caractéristiques",
  optionCategory: "Catégories d'équipement",
  option: "Équipements",
};
