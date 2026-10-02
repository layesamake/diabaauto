import type { RubricIconName } from "@/components/admin/rubric-icons";
import type { PermissionCode } from "@/services/permissions.service";

/**
 * Rubriques du back-office, groupées ici plutôt que dans la page : un test peut ainsi garantir que
 * **chaque rubrique affichée possède son icône** (une rubrique ajoutée sans icône casse la suite).
 *
 * La permission listée est celle qu'exige la garde **serveur** de l'écran cible ; elle ne sert ici
 * qu'à décider si l'entrée est proposée. Le lien n'est qu'une aide : chaque page applique sa propre
 * garde, et masquer un lien ne protège rien.
 */
export type RubricScreen = {
  readonly href: string;
  readonly title: string;
  readonly description: string;
  readonly icon: RubricIconName;
  readonly permission: PermissionCode;
};

export const RUBRIC_SCREENS: readonly RubricScreen[] = [
  {
    href: "/admin/vehicules",
    title: "Véhicules",
    description:
      "Recherche, création, publication, statut commercial, médias et prix ; fiche d'aperçu incluse.",
    icon: "vehicules",
    permission: "vehicle.view",
  },
  {
    href: "/admin/referentiels",
    title: "Référentiels",
    description:
      "Marques, modèles, carrosseries, énergies, boîtes, couleurs, équipements et caractéristiques.",
    icon: "referentiels",
    permission: "content.manage",
  },
  {
    href: "/admin/prospects",
    title: "Prospects",
    description:
      "Prospects et pistes commerciales : assignation, statut, notes privées et historique des échanges.",
    icon: "prospects",
    permission: "lead.view",
  },
  {
    href: "/admin/demandes",
    title: "Demandes sur mesure",
    description:
      "Demandes de véhicule personnalisé déposées depuis le site, et leur avancement.",
    icon: "demandes",
    permission: "lead.view",
  },
  {
    href: "/admin/clients",
    title: "Clients",
    description: "Comptes clients : coordonnées, segment et statut Revendeur.",
    icon: "clients",
    permission: "customer.view",
  },
  {
    href: "/admin/revendeurs",
    title: "Revendeurs",
    description:
      "Demandes d'agrément revendeur : prise en charge, approbation et refus motivé.",
    icon: "revendeurs",
    permission: "reseller.view",
  },
  {
    href: "/admin/commandes",
    title: "Commandes",
    description:
      "Réservations et commandes : transitions, prix convenus figés, historique et suivi logistique du véhicule.",
    icon: "commandes",
    permission: "order.view",
  },
];

/** Rubriques visibles pour l'acteur, dans l'ordre du catalogue. */
export function allowedRubricScreens(
  permissions: readonly PermissionCode[],
): RubricScreen[] {
  return RUBRIC_SCREENS.filter((screen) => permissions.includes(screen.permission));
}
