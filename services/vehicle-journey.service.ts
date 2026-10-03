import {
  publicationGaps,
  type VehicleMediaSummary,
  type VehiclePriceSummary,
  type VehicleRecord,
} from "@/services/vehicle.service";

/**
 * Parcours d'une fiche véhicule, en quatre étapes.
 *
 * La fiche d'administration empilait cinq panneaux et une quarantaine de champs : rien n'y disait
 * où l'on en était, ni ce qui empêchait de publier. Ce module calcule cet état.
 *
 * L'étape « Mise en ligne » ne réinvente AUCUNE condition : elle lit `publicationGaps`, la même
 * fonction qui autorise réellement la publication (`publishVehicle`). Un écran qui annoncerait
 * « prêt » là où le service refuse serait pire que pas d'écran du tout.
 *
 * Module pur : aucune lecture en base, aucune permission. L'appelant a déjà passé sa garde.
 */

export type VehicleStepKey = "informations" | "photos" | "prix" | "mise-en-ligne";

export type VehicleStep = {
  key: VehicleStepKey;
  /** Rang affiché (1 à 4). */
  position: number;
  label: string;
  /** Une ligne décrivant l'état réel, pas un libellé générique. */
  summary: string;
  done: boolean;
};

export type VehicleJourney = {
  steps: VehicleStep[];
  /** Ce qui manque pour publier, dans les mots de `publicationGaps`. Vide = publiable. */
  gaps: string[];
  canPublish: boolean;
  /** Étape ouverte par défaut : la première inachevée, sinon la mise en ligne. */
  defaultStep: VehicleStepKey;
};

export type JourneyInput = {
  vehicle: Pick<
    VehicleRecord,
    "brandId" | "modelId" | "year" | "condition" | "logisticsLocation" | "isPublished"
  >;
  media: readonly VehicleMediaSummary[];
  prices: readonly VehiclePriceSummary[];
  /** Nombre d'images publiques, pour le résumé de l'étape Photos. */
  imageCount: number;
  videoCount: number;
  /** Plafond d'images, repris de la limite métier. */
  maxImages: number;
};

/**
 * Conditions de publication, rattachées à l'étape qui les règle.
 *
 * Les clés `gaps` sont exactement les chaînes que renvoie `publicationGaps`. Elles vivent ici, au
 * contact de la fonction qui les produit, et non dans la page : un libellé changé d'un côté sans
 * l'autre afficherait « rempli » sur une condition manquante. Le test
 * `tests/unit/vehicle-journey.service.test.ts` vérifie qu'aucun manque possible n'échappe à ce tableau.
 */
export const PUBLICATION_CONDITIONS: readonly {
  label: string;
  gaps: readonly string[];
  step: VehicleStepKey;
}[] = [
  {
    label: "Marque, modèle, année, état et localisation renseignés",
    gaps: ["marque", "modèle", "année", "état", "localisation"],
    step: "informations",
  },
  { label: "Une photo principale publique", gaps: ["média image principal public"], step: "photos" },
  { label: "Un prix standard actif", gaps: ["prix actif STANDARD"], step: "prix" },
];

const STEP_KEYS: readonly VehicleStepKey[] = ["informations", "photos", "prix", "mise-en-ligne"];

/** `true` si la valeur reçue est bien une étape ; sert à valider un paramètre d'URL. */
export function isVehicleStepKey(value: unknown): value is VehicleStepKey {
  return typeof value === "string" && (STEP_KEYS as readonly string[]).includes(value);
}

function accord(n: number, singulier: string, pluriel: string): string {
  return `${n} ${n > 1 ? pluriel : singulier}`;
}

/** État des quatre étapes d'une fiche. */
export function buildVehicleJourney(input: JourneyInput): VehicleJourney {
  const { vehicle, media, prices, imageCount, videoCount, maxImages } = input;

  const gaps = publicationGaps(vehicle, media, prices);

  // Chaque étape ne répond que de SA part des manques : l'utilisateur doit savoir où aller.
  /** Une étape est faite quand aucun manque ne lui est rattaché. */
  const estFaite = (step: VehicleStepKey): boolean =>
    !PUBLICATION_CONDITIONS.filter((condition) => condition.step === step).some((condition) =>
      gaps.some((gap) => condition.gaps.includes(gap)),
    );

  const infosDone = estFaite("informations");
  const photosDone = estFaite("photos");
  const prixDone = estFaite("prix");

  const photosSummary = (() => {
    if (imageCount === 0) {
      return "Aucune photo : la fiche ne peut pas être publiée.";
    }

    const images = `${accord(imageCount, "photo", "photos")} sur ${maxImages}`;
    const videos = videoCount > 0 ? ` · ${accord(videoCount, "vidéo", "vidéos")}` : "";

    return photosDone ? `${images}${videos}` : `${images}${videos} — aucune n'est principale et publique`;
  })();

  const prixActif = prices.filter((price) => price.isActive).length;
  const prixSummary = prixDone
    ? accord(prixActif, "tarif actif", "tarifs actifs")
    : "Aucun prix standard actif.";

  const steps: VehicleStep[] = [
    {
      key: "informations",
      position: 1,
      label: "Informations",
      summary: infosDone ? "Complètes" : "Marque, modèle, année, état ou localisation à renseigner",
      done: infosDone,
    },
    { key: "photos", position: 2, label: "Photos", summary: photosSummary, done: photosDone },
    { key: "prix", position: 3, label: "Prix", summary: prixSummary, done: prixDone },
    {
      key: "mise-en-ligne",
      position: 4,
      label: "Mise en ligne",
      summary: vehicle.isPublished
        ? "En ligne dans le catalogue"
        : gaps.length === 0
          ? "Prêt à publier"
          : `${accord(gaps.length, "point bloquant", "points bloquants")}`,
      done: vehicle.isPublished,
    },
  ];

  // On ouvre là où le travail reste à faire : la première étape inachevée.
  const premiereInachevee = steps.find((step) => !step.done);

  return {
    steps,
    gaps,
    canPublish: gaps.length === 0,
    defaultStep: premiereInachevee?.key ?? "mise-en-ligne",
  };
}
