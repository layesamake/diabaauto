/**
 * Vocabulaire des icônes de rubriques du back-office.
 *
 * Ce fichier ne contient **aucun JSX** volontairement : il est importable depuis un test en
 * environnement `node` (la configuration de test du projet ne transforme pas le JSX, et on ne
 * modifie pas la configuration pour si peu). `RubricIcon.tsx` s'appuie dessus pour ses tracés, et
 * le typage y garantit qu'aucune icône déclarée ici ne reste sans dessin.
 */

export const RUBRIC_ICON_NAMES = [
  "aujourdhui",
  "contacts",
  "reglages",
  "vehicules",
  "referentiels",
  "prospects",
  "demandes",
  "clients",
  "revendeurs",
  "commandes",
  "personnel",
  "journal",
  "parametres",
  "contenus",
  "compte",
] as const;

export type RubricIconName = (typeof RUBRIC_ICON_NAMES)[number];
