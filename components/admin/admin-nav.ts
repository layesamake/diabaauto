import type { RubricIconName } from "@/components/admin/rubric-icons";
import type { PermissionCode } from "@/services/permissions.service";

/**
 * Navigation du back-office.
 *
 * Elle remplace un catalogue de huit rubriques de même rang par **quatre entrées de travail** et un
 * groupe Réglages. Le classement suit ce qu'un commercial fait dans la journée, pas l'organisation
 * des tables : « Référentiels » et « Personnel » se règlent une fois par mois, ils descendent donc
 * hors du chemin quotidien.
 *
 * Prospects, demandes sur mesure, clients et demandes Revendeur sont réunis dans **une seule liste
 * Contacts** (`/admin/contacts`) : ce sont les mêmes personnes à des moments différents. Les écrans
 * d'origine existent toujours, ils portent les actions (statut, assignation, revue Revendeur).
 *
 * La permission listée est celle qu'exige la garde SERVEUR de l'écran cible ; elle ne décide ici
 * que de l'affichage du lien. Masquer un lien ne protège rien : chaque page garde sa propre garde.
 */

export type AdminNavEntry = {
  readonly href: string;
  readonly label: string;
  /** Ce que l'écran permet de faire, en une phrase. Sert d'aide et de description accessible. */
  readonly description: string;
  readonly icon: RubricIconName;
  /** `null` : ouvert à tout membre du personnel (changer son propre mot de passe, par exemple). */
  readonly permission: PermissionCode | null;
  /**
   * Entrée qui réunit plusieurs sources : visible si l'acteur peut en lire AU MOINS UNE. Chaque
   * source est ensuite filtrée par sa propre permission côté serveur.
   */
  readonly anyOf?: readonly PermissionCode[];
};

export type AdminNavGroup = {
  readonly key: "travail" | "reglages";
  /** `null` : groupe sans intitulé (le premier, qui n'a pas besoin d'être nommé). */
  readonly label: string | null;
  readonly entries: readonly AdminNavEntry[];
};

export const ADMIN_NAV: readonly AdminNavGroup[] = [
  {
    key: "travail",
    label: null,
    entries: [
      {
        href: "/admin",
        label: "Aujourd'hui",
        description: "Ce qui attend une décision maintenant.",
        icon: "aujourdhui",
        permission: "vehicle.view",
      },
      {
        href: "/admin/vehicules",
        label: "Véhicules",
        description: "Stock, photos, prix et mise en ligne.",
        icon: "vehicules",
        permission: "vehicle.view",
      },
      {
        href: "/admin/contacts",
        label: "Contacts",
        description: "Prospects, demandes, clients et revendeurs : tout ce qui attend une réponse.",
        icon: "contacts",
        permission: null,
        anyOf: ["lead.view", "customer.view", "reseller.view"],
      },
      {
        href: "/admin/commandes",
        label: "Commandes",
        description: "Réservations, ventes et suivi logistique.",
        icon: "commandes",
        permission: "order.view",
      },
    ],
  },
  {
    key: "reglages",
    label: "Réglages",
    entries: [
      {
        href: "/admin/contenus",
        label: "Contenus",
        description: "Les textes des pages « À propos » et « Comment ça marche ».",
        icon: "contenus",
        permission: "content.manage",
      },
      {
        href: "/admin/referentiels",
        label: "Marques et modèles",
        description: "Carrosseries, énergies, boîtes, couleurs et équipements.",
        icon: "referentiels",
        permission: "content.manage",
      },
      {
        href: "/admin/personnel",
        label: "Équipe",
        description: "Comptes internes, rôles et accès.",
        icon: "personnel",
        permission: "user.manage",
      },
      {
        href: "/admin/audit",
        label: "Journal d'activité",
        description: "Qui a fait quoi, sur quoi, quand et pourquoi.",
        icon: "journal",
        permission: "audit.view",
      },
      {
        href: "/admin/parametres",
        label: "Paramètres",
        description: "Numéro WhatsApp, téléphone, e-mail et adresse affichés sur le site.",
        icon: "parametres",
        permission: "settings.manage",
      },
      {
        href: "/admin/compte",
        label: "Mon compte",
        description: "Mot de passe et préférences.",
        icon: "compte",
        permission: null,
      },
    ],
  },
];

function isAllowed(entry: AdminNavEntry, permissions: readonly PermissionCode[]): boolean {
  if (entry.anyOf) {
    return entry.anyOf.some((permission) => permissions.includes(permission));
  }

  return entry.permission === null || permissions.includes(entry.permission);
}

/**
 * Navigation réduite à ce que l'acteur peut réellement ouvrir. Un groupe vidé de ses entrées
 * disparaît aussi : un menu qui mène à un refus apprend l'organisation interne sans rien ouvrir.
 */
export function allowedAdminNav(permissions: readonly PermissionCode[]): AdminNavGroup[] {
  return ADMIN_NAV.flatMap((group): AdminNavGroup[] => {
    const entries = group.entries.filter((entry) => isAllowed(entry, permissions));

    return entries.length > 0 ? [{ ...group, entries }] : [];
  });
}

/** Tous les liens visibles : utile aux tests et au plan du site. */
export function allowedAdminLinks(permissions: readonly PermissionCode[]): AdminNavEntry[] {
  return allowedAdminNav(permissions).flatMap((group) => [...group.entries]);
}
