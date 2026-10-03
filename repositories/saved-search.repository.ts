import { prisma } from "@/lib/prisma/client";
import type { CatalogueFilters } from "@/services/catalogue.service";
import type {
  CreateSavedSearchData,
  SavedSearchRecord,
  SavedSearchRepository,
} from "@/services/saved-search.service";

/**
 * Accès Prisma à `saved_searches` (contrat lot 4 §2 « Sous-agent B »).
 *
 * Même règle que `repositories/customer.repository.ts` (CLAUDE.md §7) : une sélection EXPLICITE, aucune
 * relation, aucun modèle Prisma complet sérialisé. `customerId` n'est jamais exposé dans la ligne
 * traduite : il ne sert qu'à filtrer les requêtes, jamais à la projection renvoyée au service.
 *
 * `criteriaJson` est stocké tel quel (le service a déjà réduit l'objet aux clés connues de
 * `CatalogueFilters` avant l'appel à `create`) et retraversé par `toSavedSearchRecord` à la lecture :
 * aucune confiance n'est faite à la forme de la colonne JSON, une valeur inattendue retombe sur un
 * objet vide plutôt que de faire échouer la lecture de toute la liste.
 */

export const savedSearchSelect = {
  id: true,
  name: true,
  criteriaJson: true,
  notificationsEnabled: true,
  createdAt: true,
} as const;

export type SavedSearchDbRow = {
  id: string;
  name: string;
  criteriaJson: unknown;
  notificationsEnabled: boolean;
  createdAt: Date;
};

/** Traduction défensive : une valeur JSON invalide ne fait jamais planter la lecture. */
export function toSavedSearchCriteria(value: unknown): CatalogueFilters {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return value as CatalogueFilters;
}

/** Traduction explicite ligne SQL → contrat du domaine (testable sans base). */
export function toSavedSearchRecord(row: SavedSearchDbRow): SavedSearchRecord {
  return {
    id: row.id,
    name: row.name,
    criteria: toSavedSearchCriteria(row.criteriaJson),
    notificationsEnabled: row.notificationsEnabled,
    createdAt: row.createdAt,
  };
}

/** Sous-ensemble du client Prisma utilisé — permet d'injecter un double en test unitaire. */
export type SavedSearchClient = {
  savedSearch: {
    findMany(args: {
      where: { customerId: string };
      select: typeof savedSearchSelect;
      orderBy: { createdAt: "desc" };
    }): Promise<SavedSearchDbRow[]>;
    create(args: {
      data: {
        customerId: string;
        name: string;
        criteriaJson: CatalogueFilters;
        notificationsEnabled: boolean;
      };
      select: typeof savedSearchSelect;
    }): Promise<SavedSearchDbRow>;
    deleteMany(args: { where: { id: string; customerId: string } }): Promise<{ count: number }>;
  };
};

export function createSavedSearchRepository(
  client: SavedSearchClient = prisma as unknown as SavedSearchClient,
): SavedSearchRepository {
  return {
    async listByCustomer(customerId: string) {
      const rows = await client.savedSearch.findMany({
        where: { customerId },
        select: savedSearchSelect,
        orderBy: { createdAt: "desc" },
      });

      return rows.map(toSavedSearchRecord);
    },

    async create(customerId: string, data: CreateSavedSearchData) {
      const row = await client.savedSearch.create({
        data: {
          customerId,
          name: data.name,
          criteriaJson: data.criteria,
          notificationsEnabled: data.notificationsEnabled,
        },
        select: savedSearchSelect,
      });

      return toSavedSearchRecord(row);
    },

    /**
     * `deleteMany` avec `id` ET `customerId` dans le `where` : une ligne d'un autre client ne peut
     * jamais être supprimée par ce chemin, même si l'id est connu (contrat §2, RLS déjà posée).
     */
    async remove(customerId: string, id: string) {
      const result = await client.savedSearch.deleteMany({ where: { id, customerId } });
      return result.count > 0;
    },
  };
}
