import type { ReferentialKind } from "@/services/referential.service";
import type {
  DocumentVisibility,
  LogisticsLocation,
  MediaType,
  VehicleCommercialStatus,
  VehicleCondition,
} from "@/services/vehicle.service";

/**
 * Libellés et descripteurs d'écran du back-office (lot L2).
 *
 * Ce module ne contient AUCUNE règle métier : il ne fait que nommer les valeurs d'énumération du
 * schéma figé et décrire les champs de formulaire. Les mêmes descripteurs servent à rendre les
 * formulaires ET à lire les entrées dans `app/admin/actions.ts`, de sorte qu'un champ ne puisse pas
 * être rendu sans être lu (et inversement). Une valeur inconnue retombe toujours sur un libellé
 * neutre, jamais sur une supposition (patron `describeResellerStatus`).
 */

export const EMPTY_LABEL = "Non renseigné";

export function labelFor(labels: Readonly<Record<string, string>>, value: string): string {
  return labels[value] ?? EMPTY_LABEL;
}

export function orEmpty(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : EMPTY_LABEL;
}

/** Dates affichées en UTC (doc 09) sous une forme déterministe : aucun écart serveur/navigateur. */
export function formatDate(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : EMPTY_LABEL;
}

export function formatDateTime(value: Date | null | undefined): string {
  return value ? `${value.toISOString().slice(0, 16).replace("T", " ")} UTC` : EMPTY_LABEL;
}

export function formatAmount(amount: string, currency: string): string {
  return `${amount} ${currency}`;
}

// ---------------------------------------------------------------------------
// Énumérations du schéma (libellés français)
// ---------------------------------------------------------------------------

export const VEHICLE_CONDITIONS: readonly VehicleCondition[] = ["NEW", "USED"];

export const VEHICLE_CONDITION_LABELS: Readonly<Record<VehicleCondition, string>> = {
  NEW: "Neuf",
  USED: "Occasion",
};

export const LOGISTICS_LOCATIONS: readonly LogisticsLocation[] = ["CHINA", "IN_TRANSIT", "SENEGAL"];

export const LOGISTICS_LOCATION_LABELS: Readonly<Record<LogisticsLocation, string>> = {
  CHINA: "Chine (origine)",
  IN_TRANSIT: "En transit",
  SENEGAL: "Sénégal",
};

export const COMMERCIAL_STATUSES: readonly VehicleCommercialStatus[] = [
  "DRAFT",
  "AVAILABLE",
  "RESERVED",
  "SOLD",
  "UNAVAILABLE",
  "ARCHIVED",
];

export const COMMERCIAL_STATUS_LABELS: Readonly<Record<VehicleCommercialStatus, string>> = {
  DRAFT: "Brouillon",
  AVAILABLE: "Disponible",
  RESERVED: "Réservé",
  SOLD: "Vendu",
  UNAVAILABLE: "Indisponible",
  ARCHIVED: "Archivé",
};

/**
 * Transitions commerciales présentées à l'écran. Ce ne sont que des propositions d'interface : la
 * garde réelle reste `services/transitions.service.ts`, appliquée par le service.
 */
export const COMMERCIAL_STATUS_TRANSITIONS: Readonly<Record<VehicleCommercialStatus, readonly VehicleCommercialStatus[]>> = {
  DRAFT: ["AVAILABLE"],
  AVAILABLE: ["RESERVED", "UNAVAILABLE"],
  RESERVED: ["SOLD", "AVAILABLE"],
  SOLD: [],
  UNAVAILABLE: ["AVAILABLE"],
  ARCHIVED: [],
};

export const MEDIA_TYPES: readonly MediaType[] = ["IMAGE", "VIDEO"];

export const MEDIA_TYPE_LABELS: Readonly<Record<MediaType, string>> = {
  IMAGE: "Image",
  VIDEO: "Vidéo",
};

export const DOCUMENT_VISIBILITIES: readonly DocumentVisibility[] = ["PUBLIC", "PRIVATE", "SHARE_ON_REQUEST"];

export const DOCUMENT_VISIBILITY_LABELS: Readonly<Record<DocumentVisibility, string>> = {
  PUBLIC: "Publique",
  PRIVATE: "Privée",
  SHARE_ON_REQUEST: "Sur demande",
};

export const PRICING_PROFILES = ["STANDARD", "RESELLER"] as const;
export const PRICING_PROFILE_LABELS: Readonly<Record<(typeof PRICING_PROFILES)[number], string>> = {
  STANDARD: "Standard",
  RESELLER: "Revendeur",
};

export const PRICE_TYPES = ["REGULAR", "PROMOTIONAL"] as const;
export const PRICE_TYPE_LABELS: Readonly<Record<(typeof PRICE_TYPES)[number], string>> = {
  REGULAR: "Prix régulier",
  PROMOTIONAL: "Prix promotionnel",
};

export const COLOR_SCOPES = ["EXT", "INT", "BOTH"] as const;
export const COLOR_SCOPE_LABELS: Readonly<Record<(typeof COLOR_SCOPES)[number], string>> = {
  EXT: "Extérieur",
  INT: "Intérieur",
  BOTH: "Les deux",
};

export const FEATURE_DATA_TYPES = ["TEXT", "NUMBER", "BOOLEAN", "DATE", "JSON"] as const;

/** Libellés d'affichage des référentiels, dans l'ordre présenté par l'écran. */
export const REFERENTIAL_SCREEN_ORDER: readonly ReferentialKind[] = [
  "brand",
  "vehicleModel",
  "generation",
  "trim",
  "bodyType",
  "fuelType",
  "transmissionType",
  "color",
  "optionCategory",
  "option",
  "featureDefinition",
];

// ---------------------------------------------------------------------------
// Descripteurs de formulaire des référentiels
// ---------------------------------------------------------------------------

export type SelectOption = { value: string; label: string };

export type ReferentialFieldSpec = {
  name: string;
  label: string;
  control: "text" | "select" | "checkbox";
  /** Champ obligatoire à la création ; absent = valeur optionnelle ou nullable. */
  required?: boolean;
  /** Champ nullable : vide ⇒ `null` (effacement explicite), et non « champ omis ». */
  nullable?: boolean;
  /** Champ numérique : la valeur saisie est convertie avant d'être transmise au service. */
  numeric?: boolean;
  hint?: string;
  placeholder?: string;
  options?: readonly SelectOption[];
  /** Options chargées à l'exécution depuis un autre référentiel (rattachement parent). */
  optionsFrom?: "brand" | "vehicleModel" | "optionCategory";
};

const CODE_HINT = "Code technique : majuscules, chiffres et « _ ». Exemple : CITADINE.";
const SLUG_HINT = "Identifiant d'URL : minuscules, chiffres et « - ».";

/**
 * Champs de création par type de référentiel. C'est la source unique utilisée par le panneau
 * (affichage) et par la Server Action (lecture) : un champ rendu est toujours un champ transmis, et
 * les schémas `.strict()` du service ne reçoivent jamais de clé superflue.
 */
export const REFERENTIAL_FORM_FIELDS: Readonly<Record<ReferentialKind, readonly ReferentialFieldSpec[]>> = {
  brand: [
    { name: "name", label: "Nom", control: "text", required: true },
    { name: "slug", label: "Identifiant d'URL", control: "text", hint: SLUG_HINT },
    { name: "countryOfOrigin", label: "Pays d'origine", control: "text", nullable: true, placeholder: "SN" },
    { name: "logoUrl", label: "URL du logo", control: "text", nullable: true },
  ],
  vehicleModel: [
    { name: "name", label: "Nom", control: "text", required: true },
    { name: "slug", label: "Identifiant d'URL", control: "text", hint: SLUG_HINT },
    { name: "brandId", label: "Marque", control: "select", required: true, optionsFrom: "brand" },
  ],
  generation: [
    { name: "name", label: "Nom", control: "text", required: true },
    { name: "modelId", label: "Modèle", control: "select", required: true, optionsFrom: "vehicleModel" },
    { name: "startYear", label: "Année de début", control: "text", numeric: true, nullable: true },
    { name: "endYear", label: "Année de fin", control: "text", numeric: true, nullable: true },
  ],
  trim: [
    { name: "name", label: "Nom", control: "text", required: true },
    { name: "modelId", label: "Modèle", control: "select", required: true, optionsFrom: "vehicleModel" },
    { name: "code", label: "Code", control: "text", nullable: true, hint: CODE_HINT },
  ],
  bodyType: [
    { name: "name", label: "Nom", control: "text", required: true },
    { name: "code", label: "Code", control: "text", required: true, hint: CODE_HINT },
  ],
  fuelType: [
    { name: "name", label: "Nom", control: "text", required: true },
    { name: "code", label: "Code", control: "text", required: true, hint: CODE_HINT },
  ],
  transmissionType: [
    { name: "name", label: "Nom", control: "text", required: true },
    { name: "code", label: "Code", control: "text", required: true, hint: CODE_HINT },
  ],
  color: [
    { name: "name", label: "Nom", control: "text", required: true },
    { name: "code", label: "Code", control: "text", required: true, hint: CODE_HINT },
    { name: "hexCode", label: "Code hexadécimal", control: "text", nullable: true, placeholder: "#1A2B3C" },
    {
      name: "scope",
      label: "Portée",
      control: "select",
      nullable: true,
      options: COLOR_SCOPES.map((scope) => ({ value: scope, label: COLOR_SCOPE_LABELS[scope] })),
    },
  ],
  optionCategory: [
    { name: "name", label: "Nom", control: "text", required: true },
    { name: "code", label: "Code", control: "text", required: true, hint: CODE_HINT },
  ],
  option: [
    { name: "name", label: "Nom", control: "text", required: true },
    { name: "code", label: "Code", control: "text", required: true, hint: CODE_HINT },
    { name: "categoryId", label: "Catégorie", control: "select", required: true, optionsFrom: "optionCategory" },
  ],
  featureDefinition: [
    { name: "name", label: "Nom", control: "text", required: true },
    { name: "code", label: "Code", control: "text", required: true, hint: CODE_HINT },
    {
      name: "dataType",
      label: "Type de valeur",
      control: "select",
      required: true,
      options: FEATURE_DATA_TYPES.map((type) => ({ value: type, label: type })),
    },
    { name: "unit", label: "Unité", control: "text", nullable: true },
    { name: "category", label: "Catégorie", control: "text", nullable: true },
    { name: "isPublic", label: "Caractéristique publique", control: "checkbox" },
    { name: "isFilterable", label: "Filtrable sur le catalogue", control: "checkbox" },
    { name: "applicability", label: "Applicabilité", control: "text", nullable: true },
  ],
};
