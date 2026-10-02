import { z } from "zod";
import { AppError } from "@/lib/errors";
import { requireCustomer } from "@/services/access.service";
import { createSavedSearchRepository } from "@/repositories/saved-search.repository";
import { parseCatalogueFilters, type CatalogueFilters } from "@/services/catalogue.service";
import type { Actor } from "@/services/identity.service";

/**
 * Recherches enregistrées (My Diaba Auto) — contrat lot 4 §2 « Sous-agent B », décision T35.
 *
 * `criteria_json` ne stocke jamais `page`/`pageSize` : seules les clés connues de
 * `CatalogueFilters` (réutilisé depuis `services/catalogue.service.ts` — jamais redéfini ici) sont
 * acceptées, via la même validation stricte que le catalogue public (`parseCatalogueFilters`).
 * `notificationsEnabled` est accepté et persisté mais n'envoie jamais de notification (aucune
 * infrastructure e-mail disponible, T35) : les libellés d'interface (`lib/i18n/saved-searches.fr.ts`)
 * le rappellent explicitement, ce service ne promet rien de plus que le stockage de la préférence.
 *
 * Comme `services/profile.service.ts` et `services/catalogue.service.ts` : ce service ne connaît ni
 * Prisma ni le nom des tables, uniquement le port `SavedSearchRepository`. La cible (`customerId`)
 * vient toujours de l'acteur résolu côté serveur, jamais de l'entrée (invariants transversaux §1).
 */

export const MAX_SAVED_SEARCH_NAME_LENGTH = 80;

const idField = z.string().trim().uuid();

export type SavedSearchRecord = {
  id: string;
  name: string;
  criteria: CatalogueFilters;
  notificationsEnabled: boolean;
  createdAt: Date;
};

/** Projection publique = enregistrement complet : aucune colonne privée (`customerId`) n'y figure. */
export type SavedSearchView = SavedSearchRecord;

export type CreateSavedSearchData = {
  name: string;
  criteria: CatalogueFilters;
  notificationsEnabled: boolean;
};

/**
 * Port d'accès aux données. `create`/`listByCustomer` opèrent uniquement sur `saved_searches`.
 * `remove` vérifie l'appartenance avant suppression (contrat §2) : il renvoie `false` plutôt que de
 * lever, pour laisser le service traduire l'absence de ligne supprimée en `NOT_FOUND`.
 */
export type SavedSearchRepository = {
  listByCustomer(customerId: string): Promise<SavedSearchRecord[]>;
  create(customerId: string, data: CreateSavedSearchData): Promise<SavedSearchRecord>;
  /** `true` si une ligne appartenant au client a bien été supprimée, `false` sinon. */
  remove(customerId: string, id: string): Promise<boolean>;
};

export type SavedSearchDependencies = { repository: SavedSearchRepository };

let dependencies: SavedSearchDependencies = { repository: createSavedSearchRepository() };

/** Remplace le repository (tests unitaires, ou composition serveur). */
export function configureSavedSearchDependencies(next: Partial<SavedSearchDependencies>): void {
  dependencies = { ...dependencies, ...next };
}

/** Rétablit le repository Prisma par défaut. */
export function resetSavedSearchDependencies(): void {
  dependencies = { repository: createSavedSearchRepository() };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const createSavedSearchSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_SAVED_SEARCH_NAME_LENGTH),
    notificationsEnabled: z.boolean(),
    filters: z.unknown(),
  })
  .strict();

export class SavedSearchValidationError extends AppError {
  readonly fields: string[];

  constructor(fields: string[]) {
    super("VALIDATION", `Entrée invalide (champs concernés : ${fields.join(", ")}).`);
    this.name = "SavedSearchValidationError";
    this.fields = fields;
  }
}

/** Un champ inconnu est signalé par zod via `keys` (et non via `path`) : les deux cas sont couverts. */
function issueFields(issue: { path: PropertyKey[]; keys?: string[] }): string[] {
  if (Array.isArray(issue.keys) && issue.keys.length > 0) {
    return issue.keys;
  }

  return [String(issue.path[0] ?? "unknown")];
}

/**
 * Retire `page`/`pageSize` des filtres validés (contrat §2) : seules les clés connues de
 * `CatalogueFilters` sont persistées, jamais la pagination de la page d'origine. Réutilise
 * `parseCatalogueFilters` : une clé inconnue ou une valeur hors bornes lève la même `AppError`
 * `VALIDATION` que le catalogue public, jamais de repli silencieux.
 */
export function sanitizeSavedSearchCriteria(filters: CatalogueFilters): CatalogueFilters {
  const parsed = parseCatalogueFilters(filters);
  const criteria: CatalogueFilters = { ...parsed };
  delete criteria.page;
  delete criteria.pageSize;
  return criteria;
}

/** Valide l'ensemble de l'entrée ; une clé inconnue est refusée, jamais ignorée silencieusement. */
export function parseCreateSavedSearchInput(input: unknown): CreateSavedSearchData {
  const baseResult = createSavedSearchSchema.safeParse(input);

  if (!baseResult.success) {
    const fields = [...new Set(baseResult.error.issues.flatMap((issue) => issueFields(issue)))].sort();
    throw new SavedSearchValidationError(fields);
  }

  let criteria: CatalogueFilters;
  try {
    criteria = sanitizeSavedSearchCriteria((baseResult.data.filters ?? {}) as CatalogueFilters);
  } catch {
    throw new SavedSearchValidationError(["filters"]);
  }

  return {
    name: baseResult.data.name,
    notificationsEnabled: baseResult.data.notificationsEnabled,
    criteria,
  };
}

// ---------------------------------------------------------------------------
// Lecture / écriture
// ---------------------------------------------------------------------------

/** Projection explicite : uniquement les champs du contrat, jamais `customerId`. */
function projectSavedSearch(row: SavedSearchRecord): SavedSearchView {
  return {
    id: row.id,
    name: row.name,
    criteria: row.criteria,
    notificationsEnabled: row.notificationsEnabled,
    createdAt: row.createdAt,
  };
}

/** Liste des recherches du client connecté (ordre le plus récent d'abord, garanti par le repository). */
export async function listOwnSavedSearches(actor: Actor): Promise<SavedSearchView[]> {
  const customer = requireCustomer(actor);
  const rows = await dependencies.repository.listByCustomer(customer.customerId);
  return rows.map(projectSavedSearch);
}

/**
 * Crée une recherche enregistrée pour l'acteur résolu côté serveur. `filters` est validé et réduit
 * aux clés connues de `CatalogueFilters` avant toute écriture.
 */
export async function createSavedSearch(
  actor: Actor,
  input: { name: unknown; filters: unknown; notificationsEnabled: unknown },
): Promise<SavedSearchView> {
  const customer = requireCustomer(actor);
  const data = parseCreateSavedSearchInput(input);
  const row = await dependencies.repository.create(customer.customerId, data);
  return projectSavedSearch(row);
}

/**
 * Supprime une recherche du client. La propriété est vérifiée par le repository : un id inexistant
 * ou appartenant à un autre client renvoie `NOT_FOUND` — jamais `FORBIDDEN` — pour ne pas révéler
 * l'existence d'une ressource privée (services/access.service.ts, doc 07).
 */
export async function removeSavedSearch(actor: Actor, id: unknown): Promise<void> {
  const customer = requireCustomer(actor);
  const parsedId = idField.safeParse(id);
  if (!parsedId.success) {
    throw new AppError("VALIDATION", "Identifiant de recherche invalide.");
  }

  const removed = await dependencies.repository.remove(customer.customerId, parsedId.data);
  if (!removed) {
    throw new AppError("NOT_FOUND", "Ressource introuvable.");
  }
}
