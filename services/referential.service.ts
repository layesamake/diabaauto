import { z } from "zod";
import { AppError } from "@/lib/errors";
import { createReferentialRepository } from "@/repositories/referential.repository";
import { requireStaff } from "@/services/access.service";
import type { Actor } from "@/services/identity.service";

/**
 * Référentiels automobiles (doc 03 §5 : marques, modèles, générations, finitions, carrosseries,
 * énergies, boîtes de vitesses, couleurs, catégories d'équipements, équipements, caractéristiques).
 *
 * Règles du contrat L2 :
 * - les référentiels ne se suppriment pas « en dur » : un élément référencé par un véhicule (ou par
 *   un enfant du référentiel) est REFUSÉ en suppression (`CONFLICT`) et se désactive lorsqu'il porte
 *   `is_active` (seules `brands` et `vehicle_models` le portent dans le schéma figé) ;
 * - les écritures exigent `content.manage` (module `catalog`), en attendant l'arbitrage D21 des codes
 *   canoniques `taxonomy.manage` / `feature.manage` : aucune permission n'est inventée ;
 * - codes et slugs sont NORMALISÉS avant écriture et bornés ; l'unicité s'appuie sur les clés
 *   naturelles du schéma (`code`, `slug`, paires `(parent, name)` / `(parent, code)`).
 *
 * Audit : aucune action du corpus fermé (`services/audit.service.ts`) ne couvre la mutation d'un
 * référentiel. Le contrat §2.7 interdit d'en inventer une : ces écritures ne produisent donc PAS
 * d'entrée d'audit et l'écart est signalé au coordinateur (voir le rapport de lot).
 *
 * Surface d'API gelée (contrat §2bis) : `listReferential` / `createReferential` / `updateReferential`
 * / `setReferentialActive`. Le repository est résolu par une fabrique remplaçable
 * (`configureReferentialRepository`) afin que les Server Actions n'aient aucun paramètre
 * d'infrastructure et que les tests restent unitaires (sans base de données).
 */

export type ReferentialKind =
  | "brand"
  | "vehicleModel"
  | "generation"
  | "trim"
  | "bodyType"
  | "fuelType"
  | "transmissionType"
  | "color"
  | "optionCategory"
  | "option"
  | "featureDefinition";

export type ColorScope = "EXT" | "INT" | "BOTH";

export type ReferentialFeatureDataType = "TEXT" | "NUMBER" | "BOOLEAN" | "DATE" | "JSON";

/**
 * Ligne de référentiel projetée pour l'administration (surface gelée).
 * `code` porte la clé naturelle : `code` (la plupart des tables), `slug` (marques, modèles) ou
 * `name` (générations, finitions). `parentId` porte le rattachement d'unicité composite. `isActive`
 * vaut `null` quand la table n'a pas de colonne `is_active`.
 */
export type ReferentialRow = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  isActive: boolean | null;
};

export type ReferentialDescriptor = {
  readonly label: string;
  readonly naturalKey: "code" | "slug" | "name";
  /** `false` : la table n'a pas de colonne `is_active`, la désactivation est impossible. */
  readonly activatable: boolean;
};

export const REFERENTIAL_DESCRIPTORS: Readonly<Record<ReferentialKind, ReferentialDescriptor>> = {
  brand: { label: "Marque", naturalKey: "slug", activatable: true },
  vehicleModel: { label: "Modèle", naturalKey: "slug", activatable: true },
  generation: { label: "Génération", naturalKey: "name", activatable: false },
  trim: { label: "Finition", naturalKey: "name", activatable: false },
  bodyType: { label: "Carrosserie", naturalKey: "code", activatable: false },
  fuelType: { label: "Énergie", naturalKey: "code", activatable: false },
  transmissionType: { label: "Boîte de vitesses", naturalKey: "code", activatable: false },
  color: { label: "Couleur", naturalKey: "code", activatable: false },
  optionCategory: { label: "Catégorie d'équipement", naturalKey: "code", activatable: false },
  option: { label: "Équipement", naturalKey: "code", activatable: false },
  featureDefinition: { label: "Caractéristique", naturalKey: "code", activatable: false },
};

// ---------------------------------------------------------------------------
// Normalisation des clés naturelles
// ---------------------------------------------------------------------------

const CODE_PATTERN = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Normalise un code : majuscules, séparateurs ramenés à `_`, bornes 2..64. */
export function normalizeCode(raw: string): string {
  const normalized = raw
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (normalized.length < 2 || normalized.length > 64 || !CODE_PATTERN.test(normalized)) {
    throw new AppError("VALIDATION", "Code de référentiel invalide.");
  }

  return normalized;
}

/** Normalise un slug : ASCII minuscule, séparateurs ramenés à `-`, bornes 2..120. */
export function normalizeSlug(raw: string): string {
  const normalized = raw
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized.length < 2 || normalized.length > 120 || !SLUG_PATTERN.test(normalized)) {
    throw new AppError("VALIDATION", "Slug de référentiel invalide.");
  }

  return normalized;
}

/** Clé naturelle des générations/finitions : libellé replié sur des espaces simples, casse conservée. */
export function normalizeName(raw: string): string {
  const normalized = raw.trim().replace(/\s+/g, " ");
  if (normalized.length < 1 || normalized.length > 120) {
    throw new AppError("VALIDATION", "Libellé de référentiel invalide.");
  }

  return normalized;
}

function normalizeHexCode(raw: string): string {
  const normalized = raw.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(normalized)) {
    throw new AppError("VALIDATION", "Code couleur hexadécimal invalide.");
  }

  return normalized;
}

// ---------------------------------------------------------------------------
// Schémas de validation (bornes strictes, champs inconnus refusés)
// ---------------------------------------------------------------------------

const idField = z.string().trim().uuid();
const nameField = z.string().trim().min(1).max(120);
const rawCodeField = z.string().trim().min(1).max(64);
const rawSlugField = z.string().trim().min(1).max(120);
const urlField = z.string().trim().url().max(2048);
const yearField = z.number().int().min(1900).max(2100);

const schemasByKind = {
  brand: z
    .object({
      name: nameField,
      slug: rawSlugField.optional(),
      countryOfOrigin: z.string().trim().length(2).nullish(),
      logoUrl: urlField.nullish(),
    })
    .strict(),
  vehicleModel: z.object({ name: nameField, slug: rawSlugField.optional(), brandId: idField }).strict(),
  generation: z
    .object({ name: nameField, modelId: idField, startYear: yearField.nullish(), endYear: yearField.nullish() })
    .strict(),
  trim: z
    .object({ name: nameField, modelId: idField, generationId: idField.nullish(), code: rawCodeField.nullish() })
    .strict(),
  bodyType: z.object({ name: nameField, code: rawCodeField }).strict(),
  fuelType: z.object({ name: nameField, code: rawCodeField }).strict(),
  transmissionType: z.object({ name: nameField, code: rawCodeField }).strict(),
  color: z
    .object({
      name: nameField,
      code: rawCodeField,
      hexCode: z.string().trim().max(16).nullish(),
      scope: z.enum(["EXT", "INT", "BOTH"]).nullish(),
    })
    .strict(),
  optionCategory: z.object({ name: nameField, code: rawCodeField }).strict(),
  option: z.object({ name: nameField, code: rawCodeField, categoryId: idField }).strict(),
  featureDefinition: z
    .object({
      name: nameField,
      code: rawCodeField,
      dataType: z.enum(["TEXT", "NUMBER", "BOOLEAN", "DATE", "JSON"]),
      unit: z.string().trim().max(32).nullish(),
      category: z.string().trim().max(120).nullish(),
      isPublic: z.boolean().optional(),
      isFilterable: z.boolean().optional(),
      applicability: z.string().trim().max(500).nullish(),
    })
    .strict(),
} as const;

export type ReferentialCreateInput =
  | { kind: "brand"; name: string; slug: string; countryOfOrigin: string | null; logoUrl: string | null }
  | { kind: "vehicleModel"; name: string; slug: string; brandId: string }
  | { kind: "generation"; name: string; modelId: string; startYear: number | null; endYear: number | null }
  | { kind: "trim"; name: string; modelId: string; generationId: string | null; code: string | null }
  | { kind: "bodyType" | "fuelType" | "transmissionType" | "optionCategory"; name: string; code: string }
  | { kind: "color"; name: string; code: string; hexCode: string | null; scope: ColorScope | null }
  | { kind: "option"; name: string; code: string; categoryId: string }
  | {
      kind: "featureDefinition";
      name: string;
      code: string;
      dataType: ReferentialFeatureDataType;
      unit: string | null;
      category: string | null;
      isPublic: boolean;
      isFilterable: boolean;
      applicability: string | null;
    };

export type ReferentialUpdatePatch =
  | ({ kind: "brand"; id: string } & Partial<{
      name: string;
      slug: string;
      countryOfOrigin: string | null;
      logoUrl: string | null;
    }>)
  | ({ kind: "vehicleModel"; id: string } & Partial<{ name: string; slug: string; brandId: string }>)
  | ({ kind: "generation"; id: string } & Partial<{
      name: string;
      modelId: string;
      startYear: number | null;
      endYear: number | null;
    }>)
  | ({ kind: "trim"; id: string } & Partial<{
      name: string;
      modelId: string;
      generationId: string | null;
      code: string | null;
    }>)
  | ({ kind: "bodyType" | "fuelType" | "transmissionType" | "optionCategory"; id: string } & Partial<{
      name: string;
      code: string;
    }>)
  | ({ kind: "color"; id: string } & Partial<{
      name: string;
      code: string;
      hexCode: string | null;
      scope: ColorScope | null;
    }>)
  | ({ kind: "option"; id: string } & Partial<{ name: string; code: string; categoryId: string }>)
  | ({ kind: "featureDefinition"; id: string } & Partial<{
      name: string;
      code: string;
      dataType: ReferentialFeatureDataType;
      unit: string | null;
      category: string | null;
      isPublic: boolean;
      isFilterable: boolean;
      applicability: string | null;
    }>);

export type ReferentialKey = { key: string; parentId: string | null };

export type ReferentialListOptions = { includeInactive?: boolean; parentId?: string };

/**
 * Port d'accès aux référentiels. Le service ne connaît ni Prisma ni le nom des tables : le
 * repository traduit `kind` vers le modèle Prisma et applique une `select` explicite.
 */
export type ReferentialRepository = {
  list(
    kind: ReferentialKind,
    options?: { activeOnly?: boolean; parentId?: string },
  ): Promise<ReferentialRow[]>;
  findByKey(kind: ReferentialKind, key: ReferentialKey): Promise<ReferentialRow | null>;
  findById(kind: ReferentialKind, id: string): Promise<ReferentialRow | null>;
  create(input: ReferentialCreateInput): Promise<ReferentialRow>;
  update(input: ReferentialUpdatePatch): Promise<ReferentialRow>;
  setActive(kind: ReferentialKind, id: string, isActive: boolean): Promise<ReferentialRow>;
  /** Nombre d'objets métier (véhicules ou enfants du référentiel) qui utilisent cet élément. */
  countReferences(kind: ReferentialKind, id: string): Promise<number>;
  remove(kind: ReferentialKind, id: string): Promise<void>;
};

export type ReferentialDependencies = { repository: ReferentialRepository };

let referentialRepository: ReferentialRepository = createReferentialRepository();

/** Remplace le repository (tests unitaires, ou composition serveur). */
export function configureReferentialRepository(repository: ReferentialRepository): void {
  referentialRepository = repository;
}

/** Rétablit le repository Prisma par défaut. */
export function resetReferentialRepository(): void {
  referentialRepository = createReferentialRepository();
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Liste d'administration : exige `content.manage`. Par défaut seuls les éléments actifs sont
 * retournés ; `includeInactive` les inclut tous, `parentId` filtre sur le rattachement composite.
 */
export async function listReferential(
  actor: Actor,
  kind: ReferentialKind,
  options?: ReferentialListOptions,
): Promise<ReferentialRow[]> {
  requireStaff(actor, "content.manage");
  const descriptor = descriptorOf(kind);

  const parentId = options?.parentId === undefined ? undefined : idOf(options.parentId);
  const activeOnly = descriptor.activatable ? !options?.includeInactive : false;

  return referentialRepository.list(kind, { activeOnly, parentId });
}

/**
 * Lecture publique restreinte aux éléments non désactivés (doc 03 §5). Aucune permission n'est
 * requise : la `select` du repository ne retourne aucun champ d'administration.
 */
export async function listPublicReferenceValues(kind: ReferentialKind): Promise<ReferentialRow[]> {
  descriptorOf(kind);
  return referentialRepository.list(kind, { activeOnly: true });
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

export async function createReferential(
  actor: Actor,
  kind: ReferentialKind,
  input: unknown,
): Promise<{ id: string }> {
  requireStaff(actor, "content.manage");
  const parsed = parseCreate(kind, input);

  const existing = await referentialRepository.findByKey(kind, naturalKeyOfCreate(parsed));
  if (existing) {
    throw new AppError("CONFLICT", `${REFERENTIAL_DESCRIPTORS[kind].label} déjà existant.`);
  }

  const created = await referentialRepository.create(parsed);
  return { id: created.id };
}

export async function updateReferential(
  actor: Actor,
  kind: ReferentialKind,
  id: string,
  input: unknown,
): Promise<void> {
  requireStaff(actor, "content.manage");
  const referentialId = idOf(id);
  const parsed = parseUpdate(kind, referentialId, input);

  const current = await referentialRepository.findById(kind, referentialId);
  if (!current) {
    throw new AppError("NOT_FOUND", "Ressource introuvable.");
  }

  const clash = await referentialRepository.findByKey(kind, effectiveKey(parsed, current));
  if (clash && clash.id !== referentialId) {
    throw new AppError("CONFLICT", `${REFERENTIAL_DESCRIPTORS[kind].label} déjà existant.`);
  }

  await referentialRepository.update(parsed);
}

/**
 * Active ou désactive un élément (`is_active`) — refusé si la table ne porte pas ce champ
 * (seules les marques et les modèles en disposent dans le schéma figé).
 */
export async function setReferentialActive(
  actor: Actor,
  kind: ReferentialKind,
  id: string,
  isActive: boolean,
): Promise<void> {
  requireStaff(actor, "content.manage");
  const descriptor = descriptorOf(kind);
  if (!descriptor.activatable) {
    throw new AppError(
      "VALIDATION",
      `L'activation d'un élément de type « ${descriptor.label} » n'est pas prévue par le modèle.`,
    );
  }

  const referentialId = idOf(id);
  const current = await referentialRepository.findById(kind, referentialId);
  if (!current) {
    throw new AppError("NOT_FOUND", "Ressource introuvable.");
  }

  await referentialRepository.setActive(kind, referentialId, isActive);
}

/**
 * Suppression (hors surface d'écran gelée, exigée par le contrat §2.5) : autorisée seulement pour un
 * élément NON référencé. Un élément référencé renvoie `CONFLICT` et invite à la désactivation quand le
 * modèle le permet.
 */
export async function deleteReferential(actor: Actor, kind: ReferentialKind, id: string): Promise<void> {
  requireStaff(actor, "content.manage");
  const descriptor = descriptorOf(kind);

  const referentialId = idOf(id);
  const current = await referentialRepository.findById(kind, referentialId);
  if (!current) {
    throw new AppError("NOT_FOUND", "Ressource introuvable.");
  }

  const references = await referentialRepository.countReferences(kind, referentialId);
  if (references > 0) {
    const remedy = descriptor.activatable ? "désactivez-le" : "il ne peut pas être supprimé";
    throw new AppError(
      "CONFLICT",
      `« ${descriptor.label} » est utilisé par ${references} objet(s) : ${remedy}.`,
    );
  }

  await referentialRepository.remove(kind, referentialId);
}

// ---------------------------------------------------------------------------
// Analyse et normalisation des entrées
// ---------------------------------------------------------------------------

/** Valide et normalise une entrée de création ; le message ne cite jamais la valeur fautive. */
export function parseCreate(kind: ReferentialKind, input: unknown): ReferentialCreateInput {
  descriptorOf(kind);
  const result = schemasByKind[kind].safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION", "Entrée de référentiel invalide.");
  }

  return normalizeCreate(kind, result.data as Record<string, unknown>);
}

/** Valide et normalise une modification partielle ; seuls les champs fournis sont normalisés. */
export function parseUpdate(kind: ReferentialKind, id: string, input: unknown): ReferentialUpdatePatch {
  descriptorOf(kind);
  const result = schemasByKind[kind].partial().safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION", "Entrée de référentiel invalide.");
  }

  const raw = { ...(result.data as Record<string, unknown>), kind, id };
  return normalizeUpdate(kind, raw) as ReferentialUpdatePatch;
}

type UnknownRecord = Record<string, unknown>;

function normalizeCreate(kind: ReferentialKind, data: UnknownRecord): ReferentialCreateInput {
  const name = normalizeName(String(data.name));

  switch (kind) {
    case "brand":
      return {
        kind,
        name,
        slug: normalizeSlug(typeof data.slug === "string" ? data.slug : name),
        countryOfOrigin: typeof data.countryOfOrigin === "string" ? data.countryOfOrigin.toUpperCase() : null,
        logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : null,
      };
    case "vehicleModel":
      return {
        kind,
        name,
        slug: normalizeSlug(typeof data.slug === "string" ? data.slug : name),
        brandId: String(data.brandId),
      };
    case "generation": {
      const startYear = (data.startYear ?? null) as number | null;
      const endYear = (data.endYear ?? null) as number | null;
      assertYearRange(startYear, endYear);
      return { kind, name, modelId: String(data.modelId), startYear, endYear };
    }
    case "trim":
      return {
        kind,
        name,
        modelId: String(data.modelId),
        generationId: typeof data.generationId === "string" ? data.generationId : null,
        code: typeof data.code === "string" ? normalizeCode(data.code) : null,
      };
    case "bodyType":
    case "fuelType":
    case "transmissionType":
    case "optionCategory":
      return { kind, name, code: normalizeCode(String(data.code)) };
    case "color":
      return {
        kind,
        name,
        code: normalizeCode(String(data.code)),
        hexCode: typeof data.hexCode === "string" ? normalizeHexCode(data.hexCode) : null,
        scope: (data.scope as ColorScope | null | undefined) ?? null,
      };
    case "option":
      return { kind, name, code: normalizeCode(String(data.code)), categoryId: String(data.categoryId) };
    case "featureDefinition":
      return {
        kind,
        name,
        code: normalizeCode(String(data.code)),
        dataType: data.dataType as ReferentialFeatureDataType,
        unit: typeof data.unit === "string" ? data.unit : null,
        category: typeof data.category === "string" ? data.category : null,
        isPublic: data.isPublic === true,
        isFilterable: data.isFilterable === true,
        applicability: typeof data.applicability === "string" ? data.applicability : null,
      };
  }
}

function normalizeUpdate(kind: ReferentialKind, patch: UnknownRecord): UnknownRecord {
  const next = { ...patch };

  if (typeof next.name === "string") {
    next.name = kind === "generation" || kind === "trim" ? normalizeName(next.name) : next.name.trim();
  }
  if (typeof next.code === "string") {
    next.code = normalizeCode(next.code);
  }
  if (typeof next.slug === "string") {
    next.slug = normalizeSlug(next.slug);
  }
  if (typeof next.countryOfOrigin === "string") {
    next.countryOfOrigin = next.countryOfOrigin.toUpperCase();
  }
  if (typeof next.hexCode === "string") {
    next.hexCode = normalizeHexCode(next.hexCode);
  }
  if (typeof next.startYear === "number" || typeof next.endYear === "number") {
    assertYearRange(
      typeof next.startYear === "number" ? next.startYear : null,
      typeof next.endYear === "number" ? next.endYear : null,
    );
  }

  return next;
}

/** Clé naturelle normalisée d'une création, avec le parent d'unicité composite quand il existe. */
export function naturalKeyOfCreate(input: ReferentialCreateInput): ReferentialKey {
  switch (input.kind) {
    case "brand":
      return { key: input.slug, parentId: null };
    case "vehicleModel":
      return { key: input.slug, parentId: input.brandId };
    case "generation":
    case "trim":
      return { key: input.name, parentId: input.modelId };
    case "option":
      return { key: input.code, parentId: input.categoryId };
    default:
      return { key: input.code, parentId: null };
  }
}

/**
 * Clé naturelle effective d'une modification : les champs fournis remplacent l'état courant, les
 * autres sont repris de la ligne existante (nécessaire pour détecter un doublon avant écriture).
 */
export function effectiveKey(patch: ReferentialUpdatePatch, current: ReferentialRow): ReferentialKey {
  const fields = patch as Record<string, unknown>;

  return {
    key: pickKey(fields) ?? current.code,
    parentId: pickParent(fields) ?? current.parentId,
  };
}

function pickKey(fields: UnknownRecord): string | null {
  if (typeof fields.slug === "string") return fields.slug;
  if (typeof fields.code === "string") return fields.code;
  if (typeof fields.name === "string") return fields.name;
  return null;
}

function pickParent(fields: UnknownRecord): string | null | undefined {
  if (typeof fields.brandId === "string") return fields.brandId;
  if (typeof fields.modelId === "string") return fields.modelId;
  if (typeof fields.categoryId === "string") return fields.categoryId;
  return undefined;
}

function assertYearRange(startYear: number | null, endYear: number | null): void {
  if (startYear !== null && endYear !== null && endYear < startYear) {
    throw new AppError("VALIDATION", "L'année de fin précède l'année de début.");
  }
}

function idOf(value: string): string {
  const result = idField.safeParse(value);
  if (!result.success) {
    throw new AppError("VALIDATION", "Identifiant de référentiel invalide.");
  }

  return result.data;
}

function descriptorOf(kind: ReferentialKind): ReferentialDescriptor {
  const descriptor = REFERENTIAL_DESCRIPTORS[kind];
  if (!descriptor) {
    throw new AppError("VALIDATION", "Référentiel inconnu.");
  }

  return descriptor;
}