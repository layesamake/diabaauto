/**
 * Jeu de DONNÉES DE DÉMONSTRATION Diaba Auto — lot catalogue.
 *
 * Cadre : `CLAUDE.md` §9 (« Utilise des données fictives uniquement pour le développement et les tests,
 * en les identifiant clairement ») et §12 (« Les données fictives servent aux tests et aux
 * démonstrations identifiées »).
 *
 * Ce fichier est SÉPARÉ du seed de référence (`prisma/seed.ts`), qui reste volontairement dépourvu de
 * marques et de véhicules : le corpus interdit d'inventer un catalogue automobile (doc 13 §« Seeds »,
 * décisions D14, D25 et D32). Le catalogue réel est saisi par l'exploitant depuis le back-office.
 *
 * Règles d'identification appliquées, pour qu'aucune donnée fictive ne puisse être confondue avec une
 * offre réelle :
 * - toute référence commence par `DEMO-` ;
 * - tout titre porte la mention « démonstration » et « données fictives » ;
 * - les marques sont explicitement fictives (aucune marque réelle du marché) ;
 * - aucun prix, aucune remise et aucun délai ne prétend refléter une offre commerciale.
 *
 * Aucune donnée personnelle, aucun secret.
 */

/** Mention obligatoire dans le titre de tout véhicule de démonstration. */
export const DEMO_TITLE_MARKER = "données fictives";

/** Préfixe obligatoire de toute référence de démonstration. */
export const DEMO_REFERENCE_PREFIX = "DEMO-";

export type DemoBrandSeed = {
  name: string;
  slug: string;
  countryOfOrigin: string;
  models: readonly { name: string; slug: string }[];
};

export type DemoVehicleSeed = {
  reference: string;
  slug: string;
  title: string;
  brandSlug: string;
  modelSlug: string;
  condition: "NEW" | "USED";
  year: number;
  mileage: number | null;
  bodyTypeCode: string;
  fuelTypeCode: string;
  transmissionTypeCode: string;
  logisticsLocation: "CHINA" | "IN_TRANSIT" | "SENEGAL";
  /** Prix Standard de démonstration, en XOF, exprimé en chaîne pour rester exact. */
  standardPriceXof: string;
  doors: number | null;
  seats: number | null;
};

/**
 * Marques et modèles de démonstration. Volontairement fictifs : aucune marque réelle n'est citée,
 * pour qu'un écran de démonstration ne puisse pas être lu comme un catalogue commercial.
 */
export const DEMO_BRANDS: readonly DemoBrandSeed[] = [
  {
    name: "Marque Démo Alpha (fictive)",
    slug: "demo-marque-alpha",
    countryOfOrigin: "CN",
    models: [
      { name: "Alpha Citadine (fictif)", slug: "alpha-citadine" },
      { name: "Alpha SUV (fictif)", slug: "alpha-suv" },
    ],
  },
  {
    name: "Marque Démo Beta (fictive)",
    slug: "demo-marque-beta",
    countryOfOrigin: "JP",
    models: [
      { name: "Beta Berline (fictif)", slug: "beta-berline" },
      { name: "Beta Pick-up (fictif)", slug: "beta-pickup" },
    ],
  },
];

/** Véhicules de démonstration, répartis sur les trois localisations logistiques. */
export const DEMO_VEHICLES: readonly DemoVehicleSeed[] = [
  {
    reference: "DEMO-CN-0001",
    slug: "demo-vehicule-alpha-suv-neuf-chine",
    title: "Véhicule de démonstration — Alpha SUV neuf (Chine) — données fictives",
    brandSlug: "demo-marque-alpha",
    modelSlug: "alpha-suv",
    condition: "NEW",
    year: 2026,
    mileage: 0,
    bodyTypeCode: "SUV",
    fuelTypeCode: "ESSENCE",
    transmissionTypeCode: "AUTOMATIC",
    logisticsLocation: "CHINA",
    standardPriceXof: "12500000.00",
    doors: 5,
    seats: 5,
  },
  {
    reference: "DEMO-CN-0002",
    slug: "demo-vehicule-beta-pickup-occasion-chine",
    title: "Véhicule de démonstration — Beta Pick-up d'occasion (Chine) — données fictives",
    brandSlug: "demo-marque-beta",
    modelSlug: "beta-pickup",
    condition: "USED",
    year: 2021,
    mileage: 68000,
    bodyTypeCode: "PICKUP",
    fuelTypeCode: "DIESEL",
    transmissionTypeCode: "MANUAL",
    logisticsLocation: "CHINA",
    standardPriceXof: "9800000.00",
    doors: 4,
    seats: 5,
  },
  {
    reference: "DEMO-TR-0003",
    slug: "demo-vehicule-alpha-citadine-transit",
    title: "Véhicule de démonstration — Alpha Citadine en transit — données fictives",
    brandSlug: "demo-marque-alpha",
    modelSlug: "alpha-citadine",
    condition: "NEW",
    year: 2025,
    mileage: 0,
    bodyTypeCode: "HATCHBACK",
    fuelTypeCode: "HYBRID",
    transmissionTypeCode: "CVT",
    logisticsLocation: "IN_TRANSIT",
    standardPriceXof: "7900000.00",
    doors: 5,
    seats: 5,
  },
  {
    reference: "DEMO-SN-0004",
    slug: "demo-vehicule-beta-berline-occasion-senegal",
    title: "Véhicule de démonstration — Beta Berline d'occasion (Sénégal) — données fictives",
    brandSlug: "demo-marque-beta",
    modelSlug: "beta-berline",
    condition: "USED",
    year: 2019,
    mileage: 112000,
    bodyTypeCode: "SEDAN",
    fuelTypeCode: "ESSENCE",
    transmissionTypeCode: "AUTOMATIC",
    logisticsLocation: "SENEGAL",
    standardPriceXof: "6250000.00",
    doors: 4,
    seats: 5,
  },
];
