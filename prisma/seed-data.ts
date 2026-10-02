/**
 * Données de référence du seed Diaba Auto.
 *
 * Sources : `docs/07_Roles_et_permissions.docx` (§« Permissions à implémenter » et §« Matrice de
 * décision ») et `docs/13_Plan_migrations_et_seeds.docx` (§« Seeds »), arbitrée par la décision D01 de
 * `docs/decisions.md`.
 *
 * Ce fichier ne contient QUE des données de référence : codes, libellés et matrice role → permission.
 * Aucune donnée personnelle, aucun secret, aucune marque automobile ni paramètre commercial inventé :
 * les marques de départ, la devise, le numéro WhatsApp, les textes de contact et les options de
 * publication sont fournis par l'exploitant (doc 13, docs/decisions.md D14).
 */

import type { PermissionCode } from "../services/permissions.service";

/**
 * Les 26 codes de permission officiels (doc 07 §« Permissions à implémenter »).
 *
 * Source unique de vérité partagée avec `services/permissions.service.ts` : le
 * `satisfies readonly PermissionCode[]` ci-dessous échoue à la compilation si un code est ajouté,
 * retiré ou orthographié différemment d'un côté ou de l'autre.
 */
export const PERMISSION_CODES = [
  "vehicle.view",
  "vehicle.create",
  "vehicle.edit",
  "vehicle.publish",
  "vehicle.reserve",
  "vehicle.mark_sold",
  "vehicle.price_edit",
  "customer.view",
  "customer.edit",
  "lead.view",
  "lead.assign",
  "lead.update",
  "order.view",
  "order.create",
  "order.update",
  "reseller.view",
  "reseller.approve",
  "reseller.reject",
  "reseller.suspend",
  "user.manage",
  "role.manage",
  "content.manage",
  "settings.manage",
  "analytics.view",
  "audit.view",
  "storage.private_read",
] as const satisfies readonly PermissionCode[];

/** Garantit aussi l'absence de doublon dans la liste ci-dessus (bug silencieux sinon). */
export type PermissionCodeFromSeed = (typeof PERMISSION_CODES)[number];

/**
 * Libellés français des permissions, écrits dans `Permission.name` par le seed (champ obligatoire du
 * schéma canonique). Formulations alignées sur les libellés d'actions du doc 07 ; elles n'ont aucun
 * effet sur le contrôle d'accès.
 */
export const PERMISSION_LABELS: Record<PermissionCodeFromSeed, string> = {
  "vehicle.view": "Consulter les véhicules",
  "vehicle.create": "Créer un véhicule",
  "vehicle.edit": "Modifier un véhicule",
  "vehicle.publish": "Publier un véhicule",
  "vehicle.reserve": "Réserver un véhicule",
  "vehicle.mark_sold": "Marquer un véhicule comme vendu",
  "vehicle.price_edit": "Modifier le prix d'un véhicule",
  "customer.view": "Consulter les clients",
  "customer.edit": "Modifier les clients",
  "lead.view": "Consulter les prospects",
  "lead.assign": "Attribuer un prospect",
  "lead.update": "Mettre à jour un prospect",
  "order.view": "Consulter les commandes",
  "order.create": "Créer une commande",
  "order.update": "Mettre à jour une commande",
  "reseller.view": "Consulter les revendeurs",
  "reseller.approve": "Approuver un revendeur",
  "reseller.reject": "Refuser un revendeur",
  "reseller.suspend": "Suspendre un revendeur",
  "user.manage": "Gérer le personnel",
  "role.manage": "Gérer les rôles",
  "content.manage": "Gérer le contenu éditorial",
  "settings.manage": "Gérer les paramètres",
  "analytics.view": "Consulter les statistiques",
  "audit.view": "Consulter la piste d'audit",
  "storage.private_read": "Lire les documents privés du stockage",
};

/** Rôles de personnel prévus par les documents (doc 13 §« Seeds »). */
export type RoleCode = "ADMIN" | "COMMERCIAL";

export const ROLE_DEFINITIONS: ReadonlyArray<{ code: RoleCode; name: string; description: string }> = [
  // D02 (docs/decisions.md) : « Administrateur » = ADMIN et « Commercial » = COMMERCIAL, seule lecture
  // compatible entre les documents 07 et 08. `Role.description` reste facultative au schéma, mais le
  // seed la renseigne (phrase courte en français, contrat §4.6).
  {
    code: "ADMIN",
    name: "Administrateur",
    description: "Gestion globale : véhicules, clients, prospects, commandes, rôles, paramètres et audit.",
  },
  {
    code: "COMMERCIAL",
    name: "Commercial",
    description: "Suivi opérationnel des véhicules, clients, prospects et commandes confiés.",
  },
];

/**
 * Module de rattachement de chaque permission (doc 07 §4, contrat canonique §4.6).
 * Source unique de `Permission.module` pour le seed ; les 26 codes ne changent pas.
 */
export const PERMISSION_MODULES: Record<PermissionCodeFromSeed, string> = {
  "vehicle.view": "vehicle",
  "vehicle.create": "vehicle",
  "vehicle.edit": "vehicle",
  "vehicle.publish": "vehicle",
  "vehicle.reserve": "vehicle",
  "vehicle.mark_sold": "vehicle",
  "vehicle.price_edit": "vehicle",
  "customer.view": "customer",
  "customer.edit": "customer",
  "lead.view": "crm",
  "lead.assign": "crm",
  "lead.update": "crm",
  "order.view": "order",
  "order.create": "order",
  "order.update": "order",
  "reseller.view": "customer",
  "reseller.approve": "customer",
  "reseller.reject": "customer",
  "reseller.suspend": "customer",
  "user.manage": "system",
  "role.manage": "system",
  "content.manage": "catalog",
  "settings.manage": "system",
  "analytics.view": "system",
  "audit.view": "system",
  "storage.private_read": "system",
};

/** Une ligne de la matrice rôle → permission. */
export interface RolePermissionRow {
  readonly roleCode: RoleCode;
  readonly permissionCode: PermissionCodeFromSeed;
}

/** Une valeur de référentiel amorçable : code canonique + libellé français. */
export interface ReferentialSeedRow {
  readonly code: string;
  readonly name: string;
}

/**
 * Référentiels explicitement nommés par le doc 13 §« Seeds obligatoires » (qui reprend le doc 03 §5).
 *
 * - codes canoniques : ESSENCE/DIESEL/HYBRID/PHEV/ELECTRIC, SEDAN/HATCHBACK/SUV/PICKUP/MINIBUS/VAN/
 *   TRUCK/UTILITY, AUTOMATIC/MANUAL/CVT/DCT ;
 * - libellés français issus des exemples du doc 03 §5 (« Berline, SUV, pick-up, minibus,
 *   camion/utilitaire », « Essence, diesel, hybrid, PHEV, electric », « Automatique, manuelle, CVT,
 *   DCT ») ;
 * - AUCUNE marque ni modèle : D14 (liste non fournie par l'exploitant) ;
 * - AUCUNE couleur : le doc 03 §5 décrit `name, hex_code, scope` mais ne nomme aucune valeur, et
 *   rien ne doit être inventé (écart signalé au coordinateur).
 */
export const BODY_TYPE_SEEDS: readonly ReferentialSeedRow[] = [
  { code: "SEDAN", name: "Berline" },
  { code: "HATCHBACK", name: "Compacte" },
  { code: "SUV", name: "SUV" },
  { code: "PICKUP", name: "Pick-up" },
  { code: "MINIBUS", name: "Minibus" },
  { code: "VAN", name: "Fourgon" },
  { code: "TRUCK", name: "Camion" },
  { code: "UTILITY", name: "Utilitaire" },
];

export const FUEL_TYPE_SEEDS: readonly ReferentialSeedRow[] = [
  { code: "ESSENCE", name: "Essence" },
  { code: "DIESEL", name: "Diesel" },
  { code: "HYBRID", name: "Hybride" },
  { code: "PHEV", name: "Hybride rechargeable" },
  { code: "ELECTRIC", name: "Électrique" },
];

export const TRANSMISSION_TYPE_SEEDS: readonly ReferentialSeedRow[] = [
  { code: "AUTOMATIC", name: "Automatique" },
  { code: "MANUAL", name: "Manuelle" },
  { code: "CVT", name: "CVT" },
  { code: "DCT", name: "DCT" },
];

/**
 * Matrice rôle → permission.
 *
 * D01 (docs/decisions.md) : les documents nomment les deux rôles et les 26 permissions sans donner la
 * répartition ; application provisoire de la solution la plus restrictive. Chaque ligne ci-dessous
 * porte la justification de l'octroi. Pour ajuster un droit : ajouter ou retirer une seule ligne,
 * sans toucher au seed.
 */
export const ROLE_PERMISSION_MATRIX: ReadonlyArray<RolePermissionRow> = [
  // --- ADMIN — doc 07 §« Matrice de décision », colonne « Administrateur » : « Oui » sur les six
  //     lignes (créer/modifier véhicule, publier/réserver/vendre, changer prix, valider Revendeur,
  //     gérer rôles et personnel, voir audit et paramètres) ; doc 07 §Acteurs : « Gestion globale,
  //     rôles, paramètres, audit ». D01 : ADMIN reçoit les 26 permissions.
  { roleCode: "ADMIN", permissionCode: "vehicle.view" }, // doc 07 ADMIN « Oui » + D01
  { roleCode: "ADMIN", permissionCode: "vehicle.create" }, // doc 07 ADMIN « Oui » (créer/modifier véhicule) + D01
  { roleCode: "ADMIN", permissionCode: "vehicle.edit" }, // doc 07 ADMIN « Oui » (créer/modifier véhicule) + D01
  { roleCode: "ADMIN", permissionCode: "vehicle.publish" }, // doc 07 ADMIN « Oui » (publier, réserver, vendre) + D01
  { roleCode: "ADMIN", permissionCode: "vehicle.reserve" }, // doc 07 ADMIN « Oui » (publier, réserver, vendre) + D01
  { roleCode: "ADMIN", permissionCode: "vehicle.mark_sold" }, // doc 07 ADMIN « Oui » (publier, réserver, vendre) + D01
  { roleCode: "ADMIN", permissionCode: "vehicle.price_edit" }, // doc 07 ADMIN « Oui » (changer prix) + D01
  { roleCode: "ADMIN", permissionCode: "customer.view" }, // doc 07 §Acteurs « Gestion globale » + D01
  { roleCode: "ADMIN", permissionCode: "customer.edit" }, // doc 07 §Acteurs « Gestion globale » + D01
  { roleCode: "ADMIN", permissionCode: "lead.view" }, // doc 07 §Acteurs « Gestion globale » + D01
  { roleCode: "ADMIN", permissionCode: "lead.assign" }, // doc 07 §Acteurs « Gestion globale » + D01
  { roleCode: "ADMIN", permissionCode: "lead.update" }, // doc 07 §Acteurs « Gestion globale » + D01
  { roleCode: "ADMIN", permissionCode: "order.view" }, // doc 07 §Acteurs « Gestion globale » + D01
  { roleCode: "ADMIN", permissionCode: "order.create" }, // doc 07 §Acteurs « Gestion globale » + D01
  { roleCode: "ADMIN", permissionCode: "order.update" }, // doc 07 §Acteurs « Gestion globale » + D01
  { roleCode: "ADMIN", permissionCode: "reseller.view" }, // doc 07 ADMIN « Oui » (valider Revendeur, lecture incluse) + D01
  { roleCode: "ADMIN", permissionCode: "reseller.approve" }, // doc 07 ADMIN « Oui » (valider Revendeur) + D01
  { roleCode: "ADMIN", permissionCode: "reseller.reject" }, // doc 07 ADMIN « Oui » (valider Revendeur) + D01
  { roleCode: "ADMIN", permissionCode: "reseller.suspend" }, // doc 07 ADMIN « Oui » (valider Revendeur) + D01
  { roleCode: "ADMIN", permissionCode: "user.manage" }, // doc 07 ADMIN « Oui » (gérer rôles et personnel) + D01
  { roleCode: "ADMIN", permissionCode: "role.manage" }, // doc 07 ADMIN « Oui » (gérer rôles et personnel) + D01
  { roleCode: "ADMIN", permissionCode: "content.manage" }, // doc 07 ADMIN « Oui » §Acteurs « Gestion globale » + D01
  { roleCode: "ADMIN", permissionCode: "settings.manage" }, // doc 07 ADMIN « Oui » (voir audit et paramètres) + D01
  { roleCode: "ADMIN", permissionCode: "analytics.view" }, // doc 07 ADMIN « Oui » §Acteurs « Gestion globale » + D01
  { roleCode: "ADMIN", permissionCode: "audit.view" }, // doc 07 ADMIN « Oui » (voir audit et paramètres) + D01
  { roleCode: "ADMIN", permissionCode: "storage.private_read" }, // doc 07 §Contrôles : seul un droit explicite ouvre les documents privés ; ADMIN « Gestion globale » + D01

  // --- COMMERCIAL — doc 07 §Acteurs : « Back-office opérationnel selon habilitation », portée
  //     « Données confiées ou équipe ». D01 : seules les permissions que les documents ne qualifient
  //     PAS de « sur habilitation » sont accordées par défaut ; les interdictions explicites
  //     (« Non » / « Non par défaut » : reseller.approve|reject|suspend, user.manage, role.manage,
  //     settings.manage, audit.view) et les habilitations renforcées (vehicle.create|edit|publish|
  //     reserve|mark_sold|price_edit, customer.edit) ne le sont pas.
  { roleCode: "COMMERCIAL", permissionCode: "vehicle.view" }, // doc 07 : lecture du catalogue, non listée « sur habilitation » + D01
  { roleCode: "COMMERCIAL", permissionCode: "customer.view" }, // doc 07 §Contrôles : portée « Données confiées ou équipe » + D01
  { roleCode: "COMMERCIAL", permissionCode: "lead.view" }, // doc 07 §Acteurs : portée « Données confiées ou équipe » + D01
  { roleCode: "COMMERCIAL", permissionCode: "lead.assign" }, // doc 07 §Acteurs : suivi des prospects confiés + D01
  { roleCode: "COMMERCIAL", permissionCode: "lead.update" }, // doc 07 §Acteurs : suivi des prospects confiés + D01
  { roleCode: "COMMERCIAL", permissionCode: "order.view" }, // doc 07 §Acteurs : portée « Données confiées ou équipe » + D01
  { roleCode: "COMMERCIAL", permissionCode: "order.create" }, // doc 07 §Acteurs : portée « Données confiées ou équipe » + D01
  { roleCode: "COMMERCIAL", permissionCode: "order.update" }, // doc 07 §Acteurs : portée « Données confiées ou équipe » + D01
  { roleCode: "COMMERCIAL", permissionCode: "reseller.view" }, // doc 07 §Matrice : « Valider Revendeur » = « Non par défaut » → lecture seule accordée + D01
];
