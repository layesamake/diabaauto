import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import {
  REFERENTIAL_DESCRIPTORS,
  configureReferentialRepository,
  createReferential,
  deleteReferential,
  effectiveKey,
  listReferential,
  listPublicReferenceValues,
  naturalKeyOfCreate,
  normalizeCode,
  normalizeSlug,
  setReferentialActive,
  updateReferential,
  type ReferentialCreateInput,
  type ReferentialKey,
  type ReferentialKind,
  type ReferentialRepository,
  type ReferentialRow,
  type ReferentialUpdatePatch,
} from "@/services/referential.service";
import { staffActor, visitorActor } from "@/tests/unit/support/actors";

type StoredRow = ReferentialRow & { kind: ReferentialKind };

/**
 * Repository en mémoire : reproduit les clés naturelles du schéma (code, slug, paires
 * `(parent, name)` / `(parent, code)`) sans base de données.
 */
function fakeReferentialRepository(initial: StoredRow[] = [], references: Record<string, number> = {}) {
  const rows = new Map<string, StoredRow>(initial.map((row) => [`${row.kind}:${row.id}`, row]));

  const repository: ReferentialRepository = {
    async list(kind, options) {
      return [...rows.values()].filter(
        (row) =>
          row.kind === kind &&
          (!options?.activeOnly || row.isActive !== false) &&
          (!options?.parentId || row.parentId === options.parentId),
      );
    },
    async findByKey(kind, key: ReferentialKey) {
      return (
        [...rows.values()].find(
          (row) => row.kind === kind && row.code === key.key && row.parentId === key.parentId,
        ) ?? null
      );
    },
    async findById(kind, id) {
      return rows.get(`${kind}:${id}`) ?? null;
    },
    async create(input: ReferentialCreateInput) {
      const key = naturalKeyOfCreate(input);
      const row: StoredRow = {
        id: `id-${rows.size + 1}`,
        kind: input.kind,
        code: key.key,
        name: input.name,
        parentId: key.parentId,
        isActive: REFERENTIAL_DESCRIPTORS[input.kind].activatable ? true : null,
      };
      rows.set(`${input.kind}:${row.id}`, row);
      return row;
    },
    async update(patch: ReferentialUpdatePatch) {
      const current = rows.get(`${patch.kind}:${patch.id}`);
      if (!current) throw new AppError("NOT_FOUND", "Ressource introuvable.");

      const fields = patch as Record<string, unknown>;
      const updated: StoredRow = {
        ...current,
        code:
          typeof fields.code === "string"
            ? fields.code
            : typeof fields.slug === "string"
              ? fields.slug
              : typeof fields.name === "string"
                ? fields.name
                : current.code,
        parentId:
          typeof fields.brandId === "string"
            ? fields.brandId
            : typeof fields.modelId === "string"
              ? fields.modelId
              : typeof fields.categoryId === "string"
                ? fields.categoryId
                : current.parentId,
        name: typeof fields.name === "string" ? fields.name : current.name,
      };
      rows.set(`${patch.kind}:${patch.id}`, updated);
      return updated;
    },
    async setActive(kind, id, isActive) {
      const current = rows.get(`${kind}:${id}`);
      if (!current) throw new AppError("NOT_FOUND", "Ressource introuvable.");
      const updated = { ...current, isActive };
      rows.set(`${kind}:${id}`, updated);
      return updated;
    },
    async countReferences(kind, id) {
      return references[`${kind}:${id}`] ?? 0;
    },
    async remove(kind, id) {
      rows.delete(`${kind}:${id}`);
    },
  };

  return { repository, rows };
}

const BRAND_UUID = "11111111-1111-4111-8111-111111111111";
const CATEGORY_UUID = "22222222-2222-4222-8222-222222222222";
/** Identifiants valides utilisés comme lignes amorcées du double en mémoire. */
const ROW_BRAND = "bbbbbbbb-0000-4000-8000-000000000001";
const ROW_BODY = "bbbbbbbb-0000-4000-8000-000000000002";
const ROW_FUEL_A = "bbbbbbbb-0000-4000-8000-000000000003";
const ROW_FUEL_B = "bbbbbbbb-0000-4000-8000-000000000004";
/** Identifiant bidon mais syntaxiquement valide : le service ne l'utilise jamais en base ici. */
const MISSING_UUID = "99999999-9999-4999-8999-999999999999";

let fake: ReturnType<typeof fakeReferentialRepository>;

beforeEach(() => {
  fake = fakeReferentialRepository();
  configureReferentialRepository(fake.repository);
});

describe("referential service", () => {
  it("normalise les codes et les slugs avant écriture", () => {
    expect(normalizeCode(" sport utility ")).toBe("SPORT_UTILITY");
    expect(normalizeSlug("Pick-Up 4x4")).toBe("pick-up-4x4");

    expect(() => normalizeCode("A")).toThrowError(AppError);
    expect(() => normalizeSlug("--")).toThrowError(AppError);
  });

  it("crée un référentiel avec sa clé naturelle normalisée", async () => {
    const created = await createReferential(staffActor(), "bodyType", {
      name: "Pick-up",
      code: " pick_up ",
    });

    expect(created).toEqual({ id: "id-1" });
    expect([...fake.rows.values()]).toEqual([
      { id: "id-1", kind: "bodyType", code: "PICK_UP", name: "Pick-up", parentId: null, isActive: null },
    ]);
  });

  it("refuse un doublon de clé naturelle avec CONFLICT", async () => {
    fake = fakeReferentialRepository([
      { id: "b1", kind: "fuelType", code: "DIESEL", name: "Diesel", parentId: null, isActive: null },
    ]);
    configureReferentialRepository(fake.repository);

    await expect(
      createReferential(staffActor(), "fuelType", { name: "Diesel", code: "diesel" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("n'accepte les écritures que du personnel porteur de content.manage", async () => {
    await expect(
      createReferential(visitorActor, "bodyType", { name: "SUV", code: "SUV" }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

    await expect(
      createReferential(staffActor(["vehicle.view"]), "bodyType", { name: "SUV", code: "SUV" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(listReferential(visitorActor, "bodyType")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("liste par défaut les seuls éléments actifs et honore includeInactive / parentId", async () => {
    fake = fakeReferentialRepository([
      { id: "b1", kind: "brand", code: "brand-a", name: "Marque A", parentId: null, isActive: true },
      { id: "b2", kind: "brand", code: "brand-b", name: "Marque B", parentId: null, isActive: false },
      { id: "m1", kind: "vehicleModel", code: "model-a", name: "Modèle A", parentId: BRAND_UUID, isActive: true },
      { id: "m2", kind: "vehicleModel", code: "model-b", name: "Modèle B", parentId: MISSING_UUID, isActive: true },
    ]);
    configureReferentialRepository(fake.repository);

    const activeBrands = await listReferential(staffActor(), "brand");
    expect(activeBrands.map((row) => row.code)).toEqual(["brand-a"]);

    const allBrands = await listReferential(staffActor(), "brand", { includeInactive: true });
    expect(allBrands).toHaveLength(2);

    const models = await listReferential(staffActor(), "vehicleModel", { parentId: BRAND_UUID });
    expect(models.map((row) => row.code)).toEqual(["model-a"]);

    // Lecture publique : éléments actifs seulement, sans contrôle de permission.
    const publicBrands = await listPublicReferenceValues("brand");
    expect(publicBrands.map((row) => row.code)).toEqual(["brand-a"]);
  });

  it("rejette des bornes invalides et les champs inconnus", async () => {
    await expect(
      createReferential(staffActor(), "color", { name: "Noir", code: "NOIR", hexCode: "#00" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await expect(
      createReferential(staffActor(), "featureDefinition", {
        name: "Kilométrage",
        code: "MILEAGE",
        dataType: "NUMBER",
        isPublic: true,
        isFilterable: true,
        unknownField: true,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await expect(
      createReferential(staffActor(), "generation", {
        name: "Génération 2",
        modelId: BRAND_UUID,
        startYear: 2024,
        endYear: 2020,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("désactive au lieu de supprimer une marque référencée, et refuse la suppression référencée", async () => {
    fake = fakeReferentialRepository(
      [{ id: ROW_BRAND, kind: "brand", code: "changan", name: "Changan", parentId: null, isActive: true }],
      { [`brand:${ROW_BRAND}`]: 3 },
    );
    configureReferentialRepository(fake.repository);

    await setReferentialActive(staffActor(), "brand", ROW_BRAND, false);
    expect(fake.rows.get(`brand:${ROW_BRAND}`)?.isActive).toBe(false);

    await expect(deleteReferential(staffActor(), "brand", ROW_BRAND)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(fake.rows.get(`brand:${ROW_BRAND}`)).toBeDefined();

    // Réactivation possible : c'est la contrepartie de la désactivation.
    await setReferentialActive(staffActor(), "brand", ROW_BRAND, true);
    expect(fake.rows.get(`brand:${ROW_BRAND}`)?.isActive).toBe(true);
  });

  it("refuse l'activation quand le modèle n'a pas is_active", async () => {
    fake = fakeReferentialRepository([
      { id: ROW_BODY, kind: "bodyType", code: "SUV", name: "SUV", parentId: null, isActive: null },
    ]);
    configureReferentialRepository(fake.repository);

    await expect(setReferentialActive(staffActor(), "bodyType", ROW_BODY, false)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("supprime un élément non référencé et renvoie NOT_FOUND sinon", async () => {
    fake = fakeReferentialRepository([
      { id: ROW_BODY, kind: "bodyType", code: "SUV", name: "SUV", parentId: null, isActive: null },
    ]);
    configureReferentialRepository(fake.repository);

    await deleteReferential(staffActor(), "bodyType", ROW_BODY);
    expect(fake.rows.size).toBe(0);

    await expect(deleteReferential(staffActor(), "bodyType", ROW_BODY)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("détecte un doublon lors d'une modification de clé naturelle", async () => {
    fake = fakeReferentialRepository([
      { id: ROW_FUEL_A, kind: "fuelType", code: "DIESEL", name: "Diesel", parentId: null, isActive: null },
      { id: ROW_FUEL_B, kind: "fuelType", code: "ESSENCE", name: "Essence", parentId: null, isActive: null },
    ]);
    configureReferentialRepository(fake.repository);

    await expect(
      updateReferential(staffActor(), "fuelType", ROW_FUEL_B, { code: "diesel" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await updateReferential(staffActor(), "fuelType", ROW_FUEL_B, { name: "Essence sans plomb" });
    expect(fake.rows.get(`fuelType:${ROW_FUEL_B}`)?.name).toBe("Essence sans plomb");
  });

  it("calcule la clé naturelle effective d'une modification", () => {
    const current: ReferentialRow = {
      id: "opt-1",
      code: "GPS",
      name: "GPS",
      parentId: CATEGORY_UUID,
      isActive: null,
    };

    expect(effectiveKey({ kind: "option", id: "opt-1" }, current)).toEqual({
      key: "GPS",
      parentId: CATEGORY_UUID,
    });
    expect(effectiveKey({ kind: "option", id: "opt-1", code: "GPS_PLUS" }, current)).toEqual({
      key: "GPS_PLUS",
      parentId: CATEGORY_UUID,
    });
  });
});