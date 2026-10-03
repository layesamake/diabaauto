import { countWorklist, type WorklistCounts } from "@/repositories/admin-worklist.repository";
export type { WorklistCounts };
import { requireStaff } from "@/services/access.service";
import type { Actor } from "@/services/identity.service";
import type { PermissionCode } from "@/services/permissions.service";

/**
 * Liste « À traiter » de l'accueil du back-office.
 *
 * L'accueil ne dit plus OÙ ALLER mais QUOI FAIRE : chaque entrée est une situation qui attend une
 * décision, avec le lien qui la règle. Quand la liste est vide, la journée est à jour.
 *
 * Deux règles tenues ici :
 * - une entrée n'apparaît que si l'acteur porte la permission de l'écran qui la traite ; proposer
 *   une action qu'on ne peut pas faire est pire que ne rien proposer ;
 * - un comptage à zéro ne s'affiche pas : une liste de « 0 » n'est pas une liste de tâches.
 *
 * Le service n'expose aucun détail de personne ni de véhicule : seulement des nombres et des
 * libellés. Les données nominatives restent derrière la garde de leur propre écran.
 */

/** Port de comptage : remplaçable en test, pour éprouver les règles sans base (dev.md §12). */
export type WorklistCounter = (now: Date) => Promise<WorklistCounts>;

let counter: WorklistCounter = (now) => countWorklist(now);

export function configureWorklistCounter(next: WorklistCounter): void {
  counter = next;
}

export function resetWorklistCounter(): void {
  counter = (now) => countWorklist(now);
}

export type WorklistTone = "attention" | "pret" | "action";

export type WorklistItem = {
  /** Clé stable : sert de `key` de rendu et d'identifiant dans les tests. */
  key: string;
  count: number;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  tone: WorklistTone;
};

type WorklistRule = {
  key: string;
  permission: PermissionCode;
  count: (counts: WorklistCounts) => number;
  /** `n` est toujours ≥ 1 : une entrée à zéro n'est jamais construite. */
  title: (n: number) => string;
  detail: string;
  href: string;
  actionLabel: string;
  tone: WorklistTone;
};

/** Accord en nombre, sans dépendance : « 1 demande » / « 2 demandes ». */
function plural(n: number, singulier: string, pluriel: string): string {
  return `${n} ${n > 1 ? pluriel : singulier}`;
}

/**
 * Ordre d'affichage = ordre d'urgence commerciale. Une personne qui attend une réponse passe avant
 * un véhicule à publier : la première peut aller voir ailleurs, le second attendra demain.
 */
const RULES: readonly WorklistRule[] = [
  {
    key: "demandes-sans-reponse",
    permission: "lead.view",
    count: (counts) => counts.requestsReceived,
    title: (n) => plural(n, "demande sans réponse", "demandes sans réponse"),
    detail: "Des clients attendent une réponse à leur demande de véhicule.",
    href: "/admin/contacts?onglet=demandes",
    actionLabel: "Répondre",
    tone: "action",
  },
  {
    key: "prospects-a-rappeler",
    permission: "lead.view",
    count: (counts) => counts.leadsToFollowUp,
    title: (n) => plural(n, "prospect à rappeler", "prospects à rappeler"),
    detail: "Leur date de relance est arrivée.",
    href: "/admin/contacts?onglet=prospects",
    actionLabel: "Voir la liste",
    tone: "action",
  },
  {
    key: "prospects-non-assignes",
    permission: "lead.assign",
    count: (counts) => counts.leadsUnassigned,
    title: (n) => plural(n, "prospect sans commercial", "prospects sans commercial"),
    detail: "Personne ne les suit pour l'instant.",
    href: "/admin/contacts?onglet=prospects",
    actionLabel: "Assigner",
    tone: "attention",
  },
  {
    key: "revendeurs-en-attente",
    permission: "reseller.view",
    count: (counts) => counts.resellerApplicationsPending,
    title: (n) => plural(n, "demande revendeur à examiner", "demandes revendeur à examiner"),
    detail: "Tant qu'elle n'est pas tranchée, le tarif revendeur ne s'applique pas.",
    href: "/admin/contacts?onglet=revendeurs",
    actionLabel: "Examiner",
    tone: "attention",
  },
  {
    key: "vehicules-sans-photo",
    permission: "vehicle.view",
    count: (counts) => counts.vehiclesPublishedWithoutImage,
    title: (n) => plural(n, "véhicule en ligne sans photo", "véhicules en ligne sans photo"),
    detail: "Ils s'affichent sans image dans le catalogue.",
    href: "/admin/vehicules?publication=publies",
    actionLabel: "Corriger",
    tone: "attention",
  },
  {
    key: "vehicules-a-publier",
    permission: "vehicle.publish",
    count: (counts) => counts.vehiclesReadyToPublish,
    title: (n) => plural(n, "véhicule prêt à publier", "véhicules prêts à publier"),
    detail: "Informations, photo principale et prix sont complets.",
    href: "/admin/vehicules?publication=brouillons",
    actionLabel: "Publier",
    tone: "pret",
  },
];

/**
 * Construit la liste à traiter de cet acteur. Lecture seule, aucune écriture.
 *
 * Une panne de comptage ne doit pas priver le personnel de son back-office : l'appelant reçoit
 * alors une liste vide et l'accueil reste utilisable (voir `loadWorklist` côté page).
 */
export async function listWorklist(actor: Actor, now: Date = new Date()): Promise<WorklistItem[]> {
  const staff = requireStaff(actor, "vehicle.view");
  const counts = await counter(now);

  return RULES.flatMap((rule) => {
    if (!staff.permissions.includes(rule.permission)) {
      return [];
    }

    const count = rule.count(counts);
    if (count <= 0) {
      return [];
    }

    return [
      {
        key: rule.key,
        count,
        title: rule.title(count),
        detail: rule.detail,
        href: rule.href,
        actionLabel: rule.actionLabel,
        tone: rule.tone,
      },
    ];
  });
}
