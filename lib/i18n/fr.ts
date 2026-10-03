import type { CatalogueCard, CatalogueFilters } from "@/services/catalogue.service";

/**
 * Textes de l'interface publique en français (BR-143, contrat lot 3 §3.9).
 *
 * Source unique : aucun libellé d'interface n'est dupliqué dans les composants. Les identifiants de
 * code restent en anglais ; seules les valeurs sont en français. EN/AR et le routage de langue
 * restent hors lot (journal des décisions).
 *
 * Les libellés d'énumération sont typés à partir de la surface gelée de
 * `services/catalogue.service.ts` : si une valeur du service change, le typage échoue au lieu de
 * laisser un libellé manquant à l'écran.
 */

type CatalogueSort = NonNullable<CatalogueFilters["sort"]>;
type CatalogueAvailability = NonNullable<CatalogueFilters["availability"]>;
type VehicleCondition = NonNullable<CatalogueFilters["condition"]>;
type LogisticsLocation = NonNullable<CatalogueFilters["logisticsLocation"]>;
type CommercialStatus = CatalogueCard["commercialStatus"];
type EligibilityStatus = CatalogueCard["eligibilityStatus"];
type PriceType = NonNullable<CatalogueCard["price"]>["priceType"];

export const fr = {
  locale: "fr",

  common: {
    siteName: "Diaba Auto",
    loading: "Chargement…",
    retry: "Réessayer",
    backToCatalogue: "Retour au catalogue",
    backHome: "Retour à l’accueil",
    applyFilters: "Filtrer",
    resetFilters: "Réinitialiser",
    searchPlaceholder: "Marque, modèle, référence…",
    seeCatalogue: "Voir le catalogue",
    priceOnRequest: "Prix sur demande",
    share: "Partager",
    shareCopied: "Lien copié",
    noImage: "Photo à venir",
    reference: "Référence",
    year: "Année",
    mileage: "Kilométrage",
    unavailableTitle: "Catalogue temporairement indisponible",
    unavailableBody:
      "Les données du catalogue n’ont pas pu être chargées pour le moment. Réessayez dans quelques instants.",
    invalidFiltersTitle: "Filtres invalides",
    invalidFiltersBody:
      "Les critères transmis dans l’adresse ne sont pas valides. Réinitialisez les filtres pour afficher le catalogue.",
  },

  catalogue: {
    title: "Catalogue véhicules",
    intro:
      "Véhicules neufs et d’occasion situés en Chine ou au Sénégal. Les informations affichées proviennent du catalogue Diaba Auto.",
    filtersTitle: "Filtrer la recherche",
    searchLabel: "Recherche",
    brandLabel: "Marque",
    modelLabel: "Modèle",
    bodyLabel: "Carrosserie",
    fuelLabel: "Énergie",
    transmissionLabel: "Boîte de vitesses",
    conditionLabel: "État",
    locationLabel: "Localisation logistique",
    yearMinLabel: "Année minimum",
    yearMaxLabel: "Année maximum",
    availabilityLabel: "Disponibilité",
    sortLabel: "Trier par",
    brandAll: "Toutes les marques",
    modelAll: "Tous les modèles",
    bodyAll: "Toutes les carrosseries",
    fuelAll: "Toutes les énergies",
    transmissionAll: "Toutes les boîtes",
    conditionAll: "Tous les états",
    locationAll: "Toutes les localisations",
    locationQuestion: "Où se trouve le véhicule",
    locationShortAll: "Tous",
    electricOnly: "Électriques uniquement",
    moreFilters: "Plus de filtres",
    lessFilters: "Moins de filtres",
    searchSubmit: "Lancer la recherche",
    emptyTitle: "Aucun véhicule ne correspond à votre recherche",
    emptyBody:
      "Élargissez les critères ou réinitialisez les filtres pour afficher davantage de véhicules.",
    paginationLabel: "Pagination du catalogue",
    previousPage: "Page précédente",
    nextPage: "Page suivante",
    pageIndicator: (page: number, pageCount: number) => `Page ${page} sur ${pageCount}`,
  },

  vehicle: {
    galleryTitle: "Galerie du véhicule",
    galleryEmpty: "Aucun média public n’est disponible pour ce véhicule.",
    galleryThumbnail: (index: number) => `Média ${index}`,
    videoLabel: "Vidéo",
    videoPlay: "Lire la vidéo",
    videoPrivacy: "La vidéo n'est chargée qu'après ce clic.",
    summaryTitle: "Résumé technique",
    descriptionTitle: "Description",
    specsTitle: "Caractéristiques",
    keyFactsTitle: "L’essentiel",
    specsMoreTitle: "Détails complémentaires",
    specsEmpty: "Les caractéristiques détaillées seront complétées prochainement.",
    eligibilityTitle: "Éligibilité import Sénégal",
    inspectionTitle: "Rapport d’inspection",
    inspectionBody: "Rapport d’inspection disponible sur demande.",
    contactReassurance:
      "Un message ne vaut ni réservation ni commande. Réponse directe par Diaba Auto sur WhatsApp.",
    priceVehicle: "Prix du véhicule",
    priceTransport: "Transport",
    priceTotal: "Total indicatif",
    priceReseller: "Tarif revendeur",
    priceNote: "Montants communiqués à titre indicatif, hors frais supplémentaires.",
    whatsappCta: "Demander des informations sur WhatsApp",
    whatsappNote:
      "Échange direct avec Diaba Auto. Cette demande d’information ne constitue pas un devis.",
    similarTitle: "Véhicules similaires",
    publishedOn: (date: string) => `Publié le ${date}`,
  },

  brand: {
    catalogueTitle: (name: string) => `Véhicules ${name}`,
    intro: (name: string) => `Tous les véhicules ${name} publiés au catalogue Diaba Auto.`,
    unknown: "Marque inconnue",
  },

  home: {
    heroEyebrow: "Véhicules Chine → Sénégal",
    heroTitle:
      "Trouvez un véhicule en Chine ou au Sénégal, puis contactez Diaba Auto.",
    heroBody:
      "Catalogue, fiches véhicules et prise de contact directe. Aucun paiement en ligne dans cette version.",
    searchTitle: "Rechercher un véhicule",
    searchCta: "Rechercher",
    featuredTitle: "Nouveautés du catalogue",
    featuredEmpty: "Aucun véhicule n’est publié au catalogue pour le moment.",
    featuredUnavailable: "Les nouveautés ne sont pas disponibles pour le moment.",
    chinaTitle: "Depuis la Chine",
    chinaBody:
      "Véhicules localisés en Chine : le transport est indiqué séparément du prix du véhicule sur chaque fiche.",
    senegalTitle: "Au Sénégal",
    senegalBody:
      "Véhicules déjà présents au Sénégal, consultables immédiatement et disponibles pour une prise de contact directe.",
    processTitle: "Comment ça marche",
    processSteps: [
      { title: "Parcourir le catalogue", body: "Recherchez par marque, modèle, état ou localisation." },
      {
        title: "Consulter la fiche",
        body: "Le prix du véhicule et le transport sont indiqués sur deux lignes distinctes.",
      },
      {
        title: "Contacter Diaba Auto",
        body: "Poursuivez l’échange sur WhatsApp ou depuis la page de contact.",
      },
    ],
    resellerTitle: "Vous êtes revendeur ?",
    resellerBody:
      "Une demande de statut Revendeur, une fois approuvée, donne accès aux tarifs qui vous sont réservés.",
    resellerCta: "Accéder à My Diaba Auto",
  },

  labels: {
    condition: {
      NEW: "Neuf",
      USED: "Occasion",
    } satisfies Record<VehicleCondition, string>,
    logisticsLocation: {
      CHINA: "Chine",
      IN_TRANSIT: "En transit",
      SENEGAL: "Sénégal",
    } satisfies Record<LogisticsLocation, string>,
    commercialStatus: {
      DRAFT: "Brouillon",
      AVAILABLE: "Disponible",
      RESERVED: "Réservé",
      SOLD: "Vendu",
      UNAVAILABLE: "Indisponible",
      ARCHIVED: "Archivé",
    } satisfies Record<CommercialStatus, string>,
    eligibilityStatus: {
      NOT_CHECKED: "Éligibilité non vérifiée",
      ELIGIBLE: "Éligible à l’import Sénégal",
      NOT_ELIGIBLE: "Non éligible à l’import Sénégal",
      REVIEW_REQUIRED: "Éligibilité à vérifier",
    } satisfies Record<EligibilityStatus, string>,
    availability: {
      available: "Véhicules disponibles",
      all: "Tous les statuts (dont vendus)",
    } satisfies Record<CatalogueAvailability, string>,
    sort: {
      recent: "Plus récents",
      price_asc: "Prix croissant",
      price_desc: "Prix décroissant",
      year_desc: "Année décroissante",
      mileage_asc: "Kilométrage croissant",
    } satisfies Record<CatalogueSort, string>,
    priceType: {
      STANDARD: "Prix public",
      RESELLER: "Tarif revendeur",
    } satisfies Record<PriceType, string>,
  },
} as const;

export type Messages = typeof fr;

/** Montant décimal (chaîne du service) rendu selon le format français ; jamais recalculé. */
export function formatAmount(amount: string, currency: string): string {
  const value = Number(amount);

  if (!Number.isFinite(value)) {
    return `${amount} ${currency}`;
  }

  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

/** Kilométrage formaté ; l'unité n'est affichée que si la valeur est connue. */
export function formatMileage(mileage: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(mileage)} km`;
}

/** Compteur de résultats (accord singulier/pluriel). */
export function formatResultCount(count: number): string {
  const formatted = new Intl.NumberFormat("fr-FR").format(count);

  return count === 1 ? `${formatted} véhicule trouvé` : `${formatted} véhicules trouvés`;
}

/** Libellé du bouton de filtre : « Voir 4 véhicules » (singulier à 0 et 1, règle française). */
export function formatViewVehicles(count: number): string {
  const formatted = new Intl.NumberFormat("fr-FR").format(count);

  return count <= 1 ? `Voir ${formatted} véhicule` : `Voir ${formatted} véhicules`;
}

/** Date de publication au format français. */
export function formatPublishedDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}