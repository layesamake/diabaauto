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
 * Les quatre écrans Prospects, Demandes, Clients et Revendeurs restent distincts pour l'instant,
 * mais apparaissent **sous une seule entrée Contacts** : ce sont les mêmes personnes à des moments
 * différents, et les fusionner en une liste est l'étape suivante du chantier.
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
  /** Écrans rattachés, montrés sous l'entrée. */
  readonly children?: readonly AdminNavEntry[];
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
        href: "/admin/prospects",
        label: "Contacts",
        description: "Les personnes qui veulent acheter, à tous les stades.",
        icon: "contacts",
        permission: "lead.view",
        children: [
          {
            href: "/admin/prospects",
            label: "Prospects",
            description: "Pistes commerciales, assignation et suivi.",
            icon: "prospects",
            permission: "lead.view",
          },
          {
            href: "/admin/demandes",
            label: "Demandes sur mesure",
            description: "Recherches de véhicule déposées depuis le site.",
            icon: "demandes",
            permission: "lead.view",
          },
          {
            href: "/admin/clients",
            label: "Clients",
            description: "Comptes clients et leur segment.",
            icon: "clients",
            permission: "customer.view",
          },
          {
            href: "/admin/revendeurs",
            label: "Revendeurs",
            description: "Demandes d'agrément à examiner.",
            icon: "revendeurs",
            permission: "reseller.view",
          },
        ],
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
  return entry.permission === null || permissions.includes(entry.permission);
}

/**
 * Navigation réduite à ce que l'acteur peut réellement ouvrir.
 *
 * Une entrée parente dont tous les enfants sont refusés disparaît : laisser « Contacts » ouvrir un
 * écran interdit serait pire que de ne pas le proposer. Un groupe vidé de ses entrées disparaît aussi.
 */
export function allowedAdminNav(permissions: readonly PermissionCode[]): AdminNavGroup[] {
  return ADMIN_NAV.flatMap((group): AdminNavGroup[] => {
    const entries = group.entries.flatMap((entry): AdminNavEntry[] => {
      if (entry.children) {
        const children = entry.children.filter((child) => isAllowed(child, permissions));
        const premier = children[0];

        // Le parent mène au premier écran auquel l'acteur a droit ; sans aucun, il disparaît.
        return premier ? [{ ...entry, href: premier.href, children }] : [];
      }

      return isAllowed(entry, permissions) ? [entry] : [];
    });

    return entries.length > 0 ? [{ ...group, entries }] : [];
  });
}

/** Tous les liens visibles, parents et enfants confondus : utile aux tests et au plan du site. */
export function allowedAdminLinks(permissions: readonly PermissionCode[]): AdminNavEntry[] {
  return allowedAdminNav(permissions).flatMap((group) =>
    group.entries.flatMap((entry) => [entry, ...(entry.children ?? [])]),
  );
}
