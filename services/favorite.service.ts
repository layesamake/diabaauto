import { z } from "zod";
import { AppError } from "@/lib/errors";
import { requireCustomer } from "@/services/access.service";
import type { Actor } from "@/services/identity.service";

/**
 * Favoris client (My Diaba Auto) — contrat lot 4 §Sous-agent A, décision T34.
 *
 * Invariants tenus par ce module :
 * - la cible (`customerId`) vient toujours de l'acteur résolu côté serveur (`requireCustomer`),
 *   jamais d'un identifiant transmis par le formulaire ou l'URL (dev.md §6, contrat §1) ;
 * - un compte suspendu est traité comme non authentifié pour toute mutation (`requireCustomer`
 *   échoue déjà pour `visitor` ET `suspended` via `requireAuthenticated`) ;
 * - ajout/retrait/fusion sont idempotents côté repository (`upsert` / `deleteMany` / `createMany
 *   skipDuplicates`) ; la fusion dédoublonne la liste AVANT d'appeler le repository ;
 * - validation stricte : chaque identifiant de véhicule est un UUID, une entrée invalide lève
 *   `VALIDATION` au lieu d'être ignorée silencieusement (contrat §1) ;
 * - ce service ne connaît ni Prisma ni le nom des tables : il reçoit un repository (port), comme
 *   `services/profile.service.ts`.
 */

/** Borne défensive sur la fusion : une très grande liste locale n'est jamais envoyée telle quelle
 * au serveur (pas de DoS applicatif via un `localStorage` manipulé). Décision technique de ce
 * sous-agent, non précisée par le contrat. */
export const MAX_MERGE_FAVORITES = 200;

const vehicleIdSchema = z.string().trim().uuid();
const mergeVehicleIdsSchema = z.array(vehicleIdSchema).max(MAX_MERGE_FAVORITES);

/** Vue projetée d'un favori : uniquement les colonnes de `favorite_vehicles` (aucune donnée catalogue). */
export type FavoriteView = {
  vehicleId: string;
  addedAt: Date;
};

export class FavoriteValidationError extends AppError {
  readonly fields: string[];

  constructor(fields: string[]) {
    super("VALIDATION", `Entrée invalide (champs concernés : ${fields.join(", ")}).`);
    this.name = "FavoriteValidationError";
    this.fields = fields;
  }
}

/** Port d'accès aux données — Prisma, table `favorite_vehicles` uniquement (repository dédié). */
export type FavoriteRepository = {
  listByCustomer(customerId: string): Promise<{ vehicleId: string; createdAt: Date }[]>;
  /** Idempotent : un second appel avec le même couple ne crée jamais de doublon. */
  add(customerId: string, vehicleId: string): Promise<void>;
  /** Idempotent : retirer un favori déjà absent n'est jamais une erreur. */
  remove(customerId: string, vehicleId: string): Promise<void>;
  /** Idempotent : fusionne une liste d'identifiants, sans doublon en base. */
  mergeMany(customerId: string, vehicleIds: string[]): Promise<void>;
};

function parseVehicleId(input: unknown): string {
  const result = vehicleIdSchema.safeParse(input);
  if (!result.success) {
    throw new FavoriteValidationError(["vehicleId"]);
  }

  return result.data;
}

function parseVehicleIdList(input: unknown): string[] {
  const result = mergeVehicleIdsSchema.safeParse(input);
  if (!result.success) {
    throw new FavoriteValidationError(["vehicleIds"]);
  }

  // Dédoublonnage avant d'appeler le repository (contrat §Sous-agent A : « vehicleId jamais
  // multiplié par deux »).
  return [...new Set(result.data)];
}

/** Favoris du client connecté, triés du plus récent au plus ancien par le repository. */
export async function listOwnFavorites(
  repository: FavoriteRepository,
  actor: Actor,
): Promise<FavoriteView[]> {
  const customer = requireCustomer(actor);
  const rows = await repository.listByCustomer(customer.customerId);

  return rows.map((row) => ({ vehicleId: row.vehicleId, addedAt: row.createdAt }));
}

/** Ajoute un favori au compte du client connecté. */
export async function addFavorite(
  repository: FavoriteRepository,
  actor: Actor,
  vehicleId: unknown,
): Promise<void> {
  const customer = requireCustomer(actor);
  const id = parseVehicleId(vehicleId);
  await repository.add(customer.customerId, id);
}

/** Retire un favori du compte du client connecté. */
export async function removeFavorite(
  repository: FavoriteRepository,
  actor: Actor,
  vehicleId: unknown,
): Promise<void> {
  const customer = requireCustomer(actor);
  const id = parseVehicleId(vehicleId);
  await repository.remove(customer.customerId, id);
}

/**
 * Fusionne les favoris locaux (visiteur) dans le compte après connexion (T34) : idempotent, jamais
 * de doublon en base. L'appelant (Server Action) vide ensuite le stockage local — cette fonction ne
 * touche jamais `localStorage`.
 */
export async function mergeFavoritesOnLogin(
  repository: FavoriteRepository,
  actor: Actor,
  localVehicleIds: unknown,
): Promise<{ merged: number }> {
  const customer = requireCustomer(actor);
  const ids = parseVehicleIdList(localVehicleIds);

  if (ids.length === 0) {
    return { merged: 0 };
  }

  await repository.mergeMany(customer.customerId, ids);
  return { merged: ids.length };
}
