import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma/client";
import { translatePrismaError } from "@/lib/prisma/errors";
import type {
  ReferentialCreateInput,
  ReferentialKey,
  ReferentialKind,
  ReferentialRepository,
  ReferentialRow,
  ReferentialUpdatePatch,
} from "@/services/referential.service";

/**
 * Accès Prisma aux référentiels (doc 03 §5).
 *
 * Chaque requête porte une `select` explicite : aucune colonne d'administration (par exemple
 * `logo_url` d'une marque) n'est retournée par défaut ; seul le strict nécessaire de l'administration
 * (identifiant, clé naturelle, libellé, rattachement, activation) est projeté.
 *
 * Les erreurs de contrainte du schéma figé sont traduites en erreurs fonctionnelles :
 * unicité violée → `CONFLICT`, clé étrangère inconnue → `VALIDATION`, ligne absente → `NOT_FOUND`.
 */

/** Ligne minimale lue sur n'importe quel modèle référentiel. */
export type ReferentialDbRow = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  isActive: boolean | null;
};

/** Traduction explicite ligne SQL → contrat du domaine (testable sans base). */
export function toReferentialRow(row: ReferentialDbRow): ReferentialRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    parentId: row.parentId,
    isActive: row.isActive,
  };
}

const brandSelect = { id: true, slug: true, name: true, isActive: true } as const;
const modelSelect = { id: true, slug: true, name: true, brandId: true, isActive: true } as const;
const generationSelect = { id: true, name: true, modelId: true } as const;
const trimSelect = { id: true, name: true, modelId: true } as const;
const codedSelect = { id: true, code: true, name: true } as const;
const optionSelect = { id: true, code: true, name: true, categoryId: true } as const;

type ListOptions = { activeOnly?: boolean; parentId?: string };

export function createReferentialRepository(client: Prisma.TransactionClient = prisma): ReferentialRepository {
  async function list(kind: ReferentialKind, options?: ListOptions): Promise<ReferentialRow[]> {
    const activeOnly = options?.activeOnly === true;
    const parentId = options?.parentId;

    switch (kind) {
      case "brand": {
        const rows = await client.brand.findMany({
          where: { ...(activeOnly ? { isActive: true } : {}) },
          select: brandSelect,
          orderBy: { name: "asc" },
        });
        return rows.map((row) => toReferentialRow({ ...row, code: row.slug, parentId: null }));
      }
      case "vehicleModel": {
        const rows = await client.vehicleModel.findMany({
          where: {
            ...(activeOnly ? { isActive: true } : {}),
            ...(parentId ? { brandId: parentId } : {}),
          },
          select: modelSelect,
          orderBy: { name: "asc" },
        });
        return rows.map((row) => toReferentialRow({ ...row, code: row.slug, parentId: row.brandId }));
      }
      case "generation": {
        const rows = await client.generation.findMany({
          where: { ...(parentId ? { modelId: parentId } : {}) },
          select: generationSelect,
          orderBy: { name: "asc" },
        });
        return rows.map((row) => toReferentialRow({ ...row, code: row.name, parentId: row.modelId, isActive: null }));
      }
      case "trim": {
        const rows = await client.trim.findMany({
          where: { ...(parentId ? { modelId: parentId } : {}) },
          select: trimSelect,
          orderBy: { name: "asc" },
        });
        return rows.map((row) => toReferentialRow({ ...row, code: row.name, parentId: row.modelId, isActive: null }));
      }
      case "bodyType": {
        const rows = await client.bodyType.findMany({ select: codedSelect, orderBy: { name: "asc" } });
        return rows.map((row) => toReferentialRow({ ...row, parentId: null, isActive: null }));
      }
      case "fuelType": {
        const rows = await client.fuelType.findMany({ select: codedSelect, orderBy: { name: "asc" } });
        return rows.map((row) => toReferentialRow({ ...row, parentId: null, isActive: null }));
      }
      case "transmissionType": {
        const rows = await client.transmissionType.findMany({ select: codedSelect, orderBy: { name: "asc" } });
        return rows.map((row) => toReferentialRow({ ...row, parentId: null, isActive: null }));
      }
      case "color": {
        const rows = await client.color.findMany({ select: codedSelect, orderBy: { name: "asc" } });
        return rows.map((row) => toReferentialRow({ ...row, parentId: null, isActive: null }));
      }
      case "optionCategory": {
        const rows = await client.optionCategory.findMany({ select: codedSelect, orderBy: { name: "asc" } });
        return rows.map((row) => toReferentialRow({ ...row, parentId: null, isActive: null }));
      }
      case "option": {
        const rows = await client.option.findMany({
          where: { ...(parentId ? { categoryId: parentId } : {}) },
          select: optionSelect,
          orderBy: { name: "asc" },
        });
        return rows.map((row) => toReferentialRow({ ...row, parentId: row.categoryId, isActive: null }));
      }
      case "featureDefinition": {
        const rows = await client.featureDefinition.findMany({ select: codedSelect, orderBy: { name: "asc" } });
        return rows.map((row) => toReferentialRow({ ...row, parentId: null, isActive: null }));
      }
    }
  }

  async function findByKey(kind: ReferentialKind, key: ReferentialKey): Promise<ReferentialRow | null> {
    switch (kind) {
      case "brand": {
        const row = await client.brand.findFirst({ where: { slug: key.key }, select: brandSelect });
        return row ? toReferentialRow({ ...row, code: row.slug, parentId: null }) : null;
      }
      case "vehicleModel": {
        if (!key.parentId) return null;
        const row = await client.vehicleModel.findFirst({
          where: { brandId: key.parentId, slug: key.key },
          select: modelSelect,
        });
        return row ? toReferentialRow({ ...row, code: row.slug, parentId: row.brandId }) : null;
      }
      case "generation": {
        if (!key.parentId) return null;
        const row = await client.generation.findFirst({
          where: { modelId: key.parentId, name: key.key },
          select: generationSelect,
        });
        return row ? toReferentialRow({ ...row, code: row.name, parentId: row.modelId, isActive: null }) : null;
      }
      case "trim": {
        if (!key.parentId) return null;
        const row = await client.trim.findFirst({
          where: { modelId: key.parentId, name: key.key },
          select: trimSelect,
        });
        return row ? toReferentialRow({ ...row, code: row.name, parentId: row.modelId, isActive: null }) : null;
      }
      case "option": {
        if (!key.parentId) return null;
        const row = await client.option.findFirst({
          where: { categoryId: key.parentId, code: key.key },
          select: optionSelect,
        });
        return row ? toReferentialRow({ ...row, parentId: row.categoryId, isActive: null }) : null;
      }
      case "bodyType":
        return findByCode(await client.bodyType.findFirst({ where: { code: key.key }, select: codedSelect }));
      case "fuelType":
        return findByCode(await client.fuelType.findFirst({ where: { code: key.key }, select: codedSelect }));
      case "transmissionType":
        return findByCode(await client.transmissionType.findFirst({ where: { code: key.key }, select: codedSelect }));
      case "color":
        return findByCode(await client.color.findFirst({ where: { code: key.key }, select: codedSelect }));
      case "optionCategory":
        return findByCode(await client.optionCategory.findFirst({ where: { code: key.key }, select: codedSelect }));
      case "featureDefinition":
        return findByCode(await client.featureDefinition.findFirst({ where: { code: key.key }, select: codedSelect }));
    }
  }

  function findByCode(
    row: { id: string; code: string; name: string } | null,
  ): ReferentialRow | null {
    return row ? toReferentialRow({ ...row, parentId: null, isActive: null }) : null;
  }

  async function findById(kind: ReferentialKind, id: string): Promise<ReferentialRow | null> {
    switch (kind) {
      case "brand": {
        const row = await client.brand.findUnique({ where: { id }, select: brandSelect });
        return row ? toReferentialRow({ ...row, code: row.slug, parentId: null }) : null;
      }
      case "vehicleModel": {
        const row = await client.vehicleModel.findUnique({ where: { id }, select: modelSelect });
        return row ? toReferentialRow({ ...row, code: row.slug, parentId: row.brandId }) : null;
      }
      case "generation": {
        const row = await client.generation.findUnique({ where: { id }, select: generationSelect });
        return row ? toReferentialRow({ ...row, code: row.name, parentId: row.modelId, isActive: null }) : null;
      }
      case "trim": {
        const row = await client.trim.findUnique({ where: { id }, select: trimSelect });
        return row ? toReferentialRow({ ...row, code: row.name, parentId: row.modelId, isActive: null }) : null;
      }
      case "bodyType":
        return findByCode(await client.bodyType.findUnique({ where: { id }, select: codedSelect }));
      case "fuelType":
        return findByCode(await client.fuelType.findUnique({ where: { id }, select: codedSelect }));
      case "transmissionType":
        return findByCode(await client.transmissionType.findUnique({ where: { id }, select: codedSelect }));
      case "color":
        return findByCode(await client.color.findUnique({ where: { id }, select: codedSelect }));
      case "optionCategory":
        return findByCode(await client.optionCategory.findUnique({ where: { id }, select: codedSelect }));
      case "option": {
        const row = await client.option.findUnique({ where: { id }, select: optionSelect });
        return row ? toReferentialRow({ ...row, parentId: row.categoryId, isActive: null }) : null;
      }
      case "featureDefinition":
        return findByCode(await client.featureDefinition.findUnique({ where: { id }, select: codedSelect }));
    }
  }

  async function create(input: ReferentialCreateInput): Promise<ReferentialRow> {
    try {
      switch (input.kind) {
        case "brand": {
          const row = await client.brand.create({
            data: {
              name: input.name,
              slug: input.slug,
              countryOfOrigin: input.countryOfOrigin,
              logoUrl: input.logoUrl,
            },
            select: brandSelect,
          });
          return toReferentialRow({ ...row, code: row.slug, parentId: null });
        }
        case "vehicleModel": {
          const row = await client.vehicleModel.create({
            data: { name: input.name, slug: input.slug, brandId: input.brandId },
            select: modelSelect,
          });
          return toReferentialRow({ ...row, code: row.slug, parentId: row.brandId });
        }
        case "generation": {
          const row = await client.generation.create({
            data: {
              name: input.name,
              modelId: input.modelId,
              startYear: input.startYear,
              endYear: input.endYear,
            },
            select: generationSelect,
          });
          return toReferentialRow({ ...row, code: row.name, parentId: row.modelId, isActive: null });
        }
        case "trim": {
          const row = await client.trim.create({
            data: {
              name: input.name,
              modelId: input.modelId,
              generationId: input.generationId,
              code: input.code,
            },
            select: trimSelect,
          });
          return toReferentialRow({ ...row, code: row.name, parentId: row.modelId, isActive: null });
        }
        case "bodyType": {
          const row = await client.bodyType.create({ data: { name: input.name, code: input.code }, select: codedSelect });
          return findByCode(row) as ReferentialRow;
        }
        case "fuelType": {
          const row = await client.fuelType.create({ data: { name: input.name, code: input.code }, select: codedSelect });
          return findByCode(row) as ReferentialRow;
        }
        case "transmissionType": {
          const row = await client.transmissionType.create({
            data: { name: input.name, code: input.code },
            select: codedSelect,
          });
          return findByCode(row) as ReferentialRow;
        }
        case "color": {
          const row = await client.color.create({
            data: { name: input.name, code: input.code, hexCode: input.hexCode, scope: input.scope },
            select: codedSelect,
          });
          return findByCode(row) as ReferentialRow;
        }
        case "optionCategory": {
          const row = await client.optionCategory.create({
            data: { name: input.name, code: input.code },
            select: codedSelect,
          });
          return findByCode(row) as ReferentialRow;
        }
        case "option": {
          const row = await client.option.create({
            data: { name: input.name, code: input.code, categoryId: input.categoryId },
            select: optionSelect,
          });
          return toReferentialRow({ ...row, parentId: row.categoryId, isActive: null });
        }
        case "featureDefinition": {
          const row = await client.featureDefinition.create({
            data: {
              name: input.name,
              code: input.code,
              dataType: input.dataType,
              unit: input.unit,
              category: input.category,
              isPublic: input.isPublic,
              isFilterable: input.isFilterable,
              applicability: input.applicability,
            },
            select: codedSelect,
          });
          return findByCode(row) as ReferentialRow;
        }
      }
    } catch (error) {
      const translated = translatePrismaError(error, "Référentiel déjà existant.");
      if (translated) throw translated;
      throw error;
    }
  }

  async function update(input: ReferentialUpdatePatch): Promise<ReferentialRow> {
    try {
      switch (input.kind) {
        case "brand": {
          const row = await client.brand.update({
            where: { id: input.id },
            data: {
              name: input.name,
              slug: input.slug,
              countryOfOrigin: input.countryOfOrigin,
              logoUrl: input.logoUrl,
            },
            select: brandSelect,
          });
          return toReferentialRow({ ...row, code: row.slug, parentId: null });
        }
        case "vehicleModel": {
          const row = await client.vehicleModel.update({
            where: { id: input.id },
            data: { name: input.name, slug: input.slug, brandId: input.brandId },
            select: modelSelect,
          });
          return toReferentialRow({ ...row, code: row.slug, parentId: row.brandId });
        }
        case "generation": {
          const row = await client.generation.update({
            where: { id: input.id },
            data: {
              name: input.name,
              modelId: input.modelId,
              startYear: input.startYear,
              endYear: input.endYear,
            },
            select: generationSelect,
          });
          return toReferentialRow({ ...row, code: row.name, parentId: row.modelId, isActive: null });
        }
        case "trim": {
          const row = await client.trim.update({
            where: { id: input.id },
            data: {
              name: input.name,
              modelId: input.modelId,
              generationId: input.generationId,
              code: input.code,
            },
            select: trimSelect,
          });
          return toReferentialRow({ ...row, code: row.name, parentId: row.modelId, isActive: null });
        }
        case "color": {
          const row = await client.color.update({
            where: { id: input.id },
            data: { name: input.name, code: input.code, hexCode: input.hexCode, scope: input.scope },
            select: codedSelect,
          });
          return findByCode(row) as ReferentialRow;
        }
        case "option": {
          const row = await client.option.update({
            where: { id: input.id },
            data: { name: input.name, code: input.code, categoryId: input.categoryId },
            select: optionSelect,
          });
          return toReferentialRow({ ...row, parentId: row.categoryId, isActive: null });
        }
        case "featureDefinition": {
          const row = await client.featureDefinition.update({
            where: { id: input.id },
            data: {
              name: input.name,
              code: input.code,
              dataType: input.dataType,
              unit: input.unit,
              category: input.category,
              isPublic: input.isPublic,
              isFilterable: input.isFilterable,
              applicability: input.applicability,
            },
            select: codedSelect,
          });
          return findByCode(row) as ReferentialRow;
        }
        case "bodyType":
        case "fuelType":
        case "transmissionType":
        case "optionCategory": {
          const data = { name: input.name, code: input.code };
          if (input.kind === "bodyType") {
            const row = await client.bodyType.update({ where: { id: input.id }, data, select: codedSelect });
            return findByCode(row) as ReferentialRow;
          }
          if (input.kind === "fuelType") {
            const row = await client.fuelType.update({ where: { id: input.id }, data, select: codedSelect });
            return findByCode(row) as ReferentialRow;
          }
          if (input.kind === "transmissionType") {
            const row = await client.transmissionType.update({ where: { id: input.id }, data, select: codedSelect });
            return findByCode(row) as ReferentialRow;
          }
          const row = await client.optionCategory.update({ where: { id: input.id }, data, select: codedSelect });
          return findByCode(row) as ReferentialRow;
        }
      }
    } catch (error) {
      const translated = translatePrismaError(error, "Référentiel déjà existant.");
      if (translated) throw translated;
      throw error;
    }
  }

  async function setActive(kind: ReferentialKind, id: string, isActive: boolean): Promise<ReferentialRow> {
    try {
      switch (kind) {
        case "brand": {
          const row = await client.brand.update({ where: { id }, data: { isActive }, select: brandSelect });
          return toReferentialRow({ ...row, code: row.slug, parentId: null });
        }
        case "vehicleModel": {
          const row = await client.vehicleModel.update({
            where: { id },
            data: { isActive },
            select: modelSelect,
          });
          return toReferentialRow({ ...row, code: row.slug, parentId: row.brandId });
        }
        default:
          // Les autres tables du schéma figé ne portent pas `is_active` : le service intercepte en
          // amont (VALIDATION).
          throw new AppError("VALIDATION", "Désactivation non supportée par ce référentiel.");
      }
    } catch (error) {
      const translated = translatePrismaError(error, "Référentiel déjà existant.");
      if (translated) throw translated;
      throw error;
    }
  }

  async function countReferences(kind: ReferentialKind, id: string): Promise<number> {
    switch (kind) {
      case "brand":
        return (
          (await client.vehicleModel.count({ where: { brandId: id } })) +
          (await client.vehicle.count({ where: { brandId: id } }))
        );
      case "vehicleModel":
        return (
          (await client.generation.count({ where: { modelId: id } })) +
          (await client.trim.count({ where: { modelId: id } })) +
          (await client.vehicle.count({ where: { modelId: id } }))
        );
      case "generation":
        return (
          (await client.trim.count({ where: { generationId: id } })) +
          (await client.vehicle.count({ where: { generationId: id } }))
        );
      case "trim":
        return client.vehicle.count({ where: { trimId: id } });
      case "bodyType":
        return client.vehicle.count({ where: { bodyTypeId: id } });
      case "fuelType":
        return client.vehicle.count({ where: { fuelTypeId: id } });
      case "transmissionType":
        return client.vehicle.count({ where: { transmissionTypeId: id } });
      case "color":
        return client.vehicle.count({ where: { OR: [{ exteriorColorId: id }, { interiorColorId: id }] } });
      case "optionCategory":
        return client.option.count({ where: { categoryId: id } });
      case "option":
        return client.vehicleOption.count({ where: { optionId: id } });
      case "featureDefinition":
        return client.vehicleFeature.count({ where: { featureDefinitionId: id } });
    }
  }

  async function remove(kind: ReferentialKind, id: string): Promise<void> {
    try {
      switch (kind) {
        case "brand":
          await client.brand.delete({ where: { id } });
          return;
        case "vehicleModel":
          await client.vehicleModel.delete({ where: { id } });
          return;
        case "generation":
          await client.generation.delete({ where: { id } });
          return;
        case "trim":
          await client.trim.delete({ where: { id } });
          return;
        case "bodyType":
          await client.bodyType.delete({ where: { id } });
          return;
        case "fuelType":
          await client.fuelType.delete({ where: { id } });
          return;
        case "transmissionType":
          await client.transmissionType.delete({ where: { id } });
          return;
        case "color":
          await client.color.delete({ where: { id } });
          return;
        case "optionCategory":
          await client.optionCategory.delete({ where: { id } });
          return;
        case "option":
          await client.option.delete({ where: { id } });
          return;
        case "featureDefinition":
          await client.featureDefinition.delete({ where: { id } });
          return;
      }
    } catch (error) {
      const translated = translatePrismaError(error, "Suppression impossible.");
      if (translated) throw translated;
      throw error;
    }
  }

  return { list, findByKey, findById, create, update, setActive, countReferences, remove };
}