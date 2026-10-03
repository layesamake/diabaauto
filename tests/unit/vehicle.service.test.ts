import { vi, beforeEach, describe, expect, it } from "vitest";
import type { AuditLogEntry } from "@/services/audit.service";
import {
  archiveVehicle,
  changeCommercialStatus,
  configureVehicleDependencies,
  createVehicle,
  formatVehicleReference,
  getVehicle,
  isValidVehicleReference,
  listVehicles,
  nextVehicleReference,
  nextVehicleSequence,
  projectPublicVehicle,
  publicationGaps,
  publishVehicle,
  unpublishVehicle,
  updateVehicle,
  type VehicleCreateData,
  type VehicleDetail,
  type VehicleListItem,
  type VehicleListFilters,
  type VehicleMediaSummary,
  type VehiclePriceSummary,
  type VehicleRecord,
  type VehicleRepository,
  type VehicleUpdatePatch,
} from "@/services/vehicle.service";
import { publicVehicleSelect, SENSITIVE_VEHICLE_FIELDS } from "@/repositories/vehicle.repository";
import { staffActor, visitorActor } from "@/tests/unit/support/actors";

const BRAND = "11111111-1111-4111-8111-111111111111";
const MODEL = "22222222-2222-4222-8222-222222222222";
const FUEL = "33333333-3333-4333-8333-333333333333";
const TRANSMISSION = "44444444-4444-4444-8444-444444444444";
const BODY = "55555555-5555-4555-8555-555555555555";
const MISSING = "99999999-9999-4999-8999-999999999999";

/** Identifiants valides (UUID) générés pour le double en mémoire. */
function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function validVehicleInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Toyota Land Cruiser 2020",
    brandId: BRAND,
    modelId: MODEL,
    condition: "USED",
    year: 2026,
    fuelTypeId: FUEL,
    transmissionTypeId: TRANSMISSION,
    bodyTypeId: BODY,
    logisticsLocation: "SENEGAL",
    supplierReference: "SUP-42",
    ...overrides,
  };
}

/** Repository en mémoire : aucun accès base, mêmes contrats que l'implémentation Prisma. */
function fakeVehicleRepository() {
  const vehicles = new Map<string, VehicleRecord>();
  const media: VehicleMediaSummary[] = [];
  const prices: VehiclePriceSummary[] = [];
  const sequences = new Map<number, number>();
  let counter = 0;

  const repository: VehicleRepository = {
    async findByReference(reference) {
      return [...vehicles.values()].find((vehicle) => vehicle.reference === reference) ?? null;
    },
    async findById(id) {
      return vehicles.get(id) ?? null;
    },
    async findDetailById(id): Promise<VehicleDetail | null> {
      const record = vehicles.get(id);
      if (!record) return null;
      const item: VehicleListItem = { ...record, featured: false, mileage: null };
      return {
        ...item,
        description: record.description,
        generationId: null,
        trimId: null,
        firstRegistrationDate: null,
        previousOwners: null,
        accidentKnown: null,
        serviceHistoryAvailable: null,
        fuelTypeId: FUEL,
        transmissionTypeId: TRANSMISSION,
        bodyTypeId: BODY,
        exteriorColorId: null,
        interiorColorId: null,
        powerKw: null,
        powerHp: null,
        engineDisplacement: null,
        doors: null,
        seats: null,
        supplierReference: null,
        supplierName: null,
        sourceType: null,
        sourceUrl: null,
        archivedAt: record.archivedAt,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      };
    },
    async list(filters: VehicleListFilters) {
      const all = [...vehicles.values()].filter(
        (vehicle) =>
          (!filters.commercialStatus || vehicle.commercialStatus === filters.commercialStatus) &&
          (filters.isPublished === undefined || vehicle.isPublished === filters.isPublished) &&
          (!filters.search ||
            vehicle.title.toLowerCase().includes(filters.search.toLowerCase()) ||
            vehicle.reference.toLowerCase().includes(filters.search.toLowerCase())),
      );
      const page = filters.page ?? 1;
      const pageSize = filters.pageSize ?? 20;
      return {
        items: all.slice((page - 1) * pageSize, page * pageSize).map((record) => ({
          ...record,
          featured: false,
          mileage: null,
          hasPrimaryImage: true,
          hasStandardPrice: true,
        })),
        total: all.length,
      };
    },
    async countStages() {
      return { all: vehicles.size, online: 0, ready: 0, incomplete: 0, sold: 0 };
    },
    async nextReferenceSequence(year) {
      return (sequences.get(year) ?? 0) + 1;
    },
    async create(input: VehicleCreateData) {
      const id = uuid(++counter);
      const record: VehicleRecord = {
        id,
        reference: input.reference,
        slug: input.slug,
        title: input.title,
        description: input.description,
        brandId: input.brandId,
        modelId: input.modelId,
        year: input.year,
        condition: input.condition,
        logisticsLocation: input.logisticsLocation,
        commercialStatus: "DRAFT",
        isPublished: false,
        publishedAt: null,
        archivedAt: null,
      };
      vehicles.set(id, record);

      const suffix = Number.parseInt(input.reference.slice(9), 10);
      if (Number.isInteger(suffix)) {
        sequences.set(input.year, Math.max(sequences.get(input.year) ?? 0, suffix));
      }

      return record;
    },
    async update(id: string, patch: VehicleUpdatePatch) {
      const current = vehicles.get(id);
      if (!current) throw new Error("vehicle not found");
      const updated = { ...current, ...patch } as VehicleRecord;
      vehicles.set(id, updated);
      return updated;
    },
    async setPublication(id, values) {
      const current = vehicles.get(id);
      if (!current) throw new Error("vehicle not found");
      const updated = { ...current, isPublished: values.isPublished, publishedAt: values.publishedAt };
      vehicles.set(id, updated);
      return updated;
    },
    async setCommercialStatus(id, status, archivedAt) {
      const current = vehicles.get(id);
      if (!current) throw new Error("vehicle not found");
      const updated = { ...current, commercialStatus: status, archivedAt };
      vehicles.set(id, updated);
      return updated;
    },
    async listMedia() {
      return [...media];
    },
    async listPrices() {
      return [...prices];
    },
    async transaction(fn) {
      return fn(repository);
    },
  };

  return { repository, vehicles, media, prices };
}

let fake: ReturnType<typeof fakeVehicleRepository>;
let auditEntries: AuditLogEntry[];

beforeEach(() => {
  fake = fakeVehicleRepository();
  auditEntries = [];
  configureVehicleDependencies({
    repository: fake.repository,
    audit: async (entry) => {
      auditEntries.push(entry);
    },
  });
});

async function persistedVehicle() {
  return createVehicle(staffActor(), validVehicleInput());
}

describe("vehicle reference (DBC-YYYY-NNNNNN)", () => {
  it("valide et formate la référence imposée par le doc 03 §6.1", () => {
    expect(formatVehicleReference(2026, 7)).toBe("DBC-2026-000007");
    expect(isValidVehicleReference("DBC-2026-000007")).toBe(true);
    expect(isValidVehicleReference("DBC-26-7")).toBe(false);
    expect(() => formatVehicleReference(2026, 0)).toThrowError(/séquence/i);
  });

  it("propose le numéro suivant de l'année (max existant + 1)", () => {
    const existing = ["DBC-2026-000003", "DBC-2026-000011", "DBC-2025-000099"];
    expect(nextVehicleSequence(2026, existing)).toBe(12);
    expect(nextVehicleReference(2026, existing)).toBe("DBC-2026-000012");
    expect(nextVehicleReference(2024, existing)).toBe("DBC-2024-000001");
  });
});

describe("vehicle service", () => {
  it("génère la référence côté serveur et refuse les champs privilégiés", async () => {
    const first = await persistedVehicle();
    expect(first.reference).toBe("DBC-2026-000001");
    expect(first.slug).toContain("2026-000001");

    const stored = await getVehicle(staffActor(), first.id);
    expect(stored?.commercialStatus).toBe("DRAFT");
    expect(stored?.isPublished).toBe(false);

    const second = await createVehicle(staffActor(), validVehicleInput({ title: "Autre véhicule" }));
    expect(second.reference).toBe("DBC-2026-000002");

    await expect(
      createVehicle(staffActor(), validVehicleInput({ isPublished: true })),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await expect(
      createVehicle(staffActor(), validVehicleInput({ commercialStatus: "AVAILABLE" })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("exige la permission correspondante à chaque écriture", async () => {
    await expect(createVehicle(visitorActor, validVehicleInput())).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });

    await expect(
      createVehicle(staffActor(["vehicle.view", "vehicle.edit"]), validVehicleInput()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(getVehicle(visitorActor, MISSING)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("modifie uniquement les champs autorisés et renvoie NOT_FOUND sinon", async () => {
    const vehicle = await persistedVehicle();

    await updateVehicle(staffActor(), vehicle.id, { title: "Titre corrigé" });
    expect((await getVehicle(staffActor(), vehicle.id))?.title).toBe("Titre corrigé");

    await expect(
      updateVehicle(staffActor(), vehicle.id, { reference: "DBC-2026-009999" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await expect(updateVehicle(staffActor(), MISSING, { title: "Titre corrigé" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("liste et filtre les véhicules avec une pagination bornée", async () => {
    await createVehicle(staffActor(), validVehicleInput({ title: "Alpha" }));
    await createVehicle(staffActor(), validVehicleInput({ title: "Beta" }));
    await createVehicle(staffActor(), validVehicleInput({ title: "Gamma" }));

    const page = await listVehicles(staffActor(), { search: "Alpha", page: 1, pageSize: 2 });
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);

    const firstPage = await listVehicles(staffActor(), { page: 1, pageSize: 2 });
    expect(firstPage.total).toBe(3);
    expect(firstPage.items).toHaveLength(2);

    const drafts = await listVehicles(staffActor(), { commercialStatus: "DRAFT" });
    expect(drafts.total).toBe(3);

    await expect(listVehicles(staffActor(), { pageSize: 500 })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("compte les onglets sur la recherche seule, sans l'étape ni la page", async () => {
    await createVehicle(staffActor(), validVehicleInput({ title: "Alpha" }));
    const spy = vi.spyOn(fake.repository, "countStages");

    const result = await listVehicles(staffActor(), { search: "Alpha", stage: "ready", page: 2, pageSize: 5 });

    // Sans cela, l'onglet « Prêts » afficherait 0 partout ailleurs : chaque onglet compterait dans le sien.
    expect(spy).toHaveBeenCalledWith({ search: "Alpha" });
    expect(result.stageCounts).toMatchObject({ all: 1 });
  });

  it("refuse une étape inconnue", async () => {
    await expect(
      listVehicles(staffActor(), { stage: "archived" as never }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refuse la liste à qui n'a pas vehicle.view, sans compter quoi que ce soit", async () => {
    const spy = vi.spyOn(fake.repository, "countStages");

    await expect(listVehicles(staffActor(["lead.view"]), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuse la publication sans média principal ni prix actif, puis l'accepte", async () => {
    const vehicle = await persistedVehicle();

    await expect(publishVehicle(staffActor(), vehicle.id)).rejects.toMatchObject({
      code: "VALIDATION",
      message: expect.stringContaining("média image principal public"),
    });
    expect(auditEntries).toHaveLength(0);

    fake.media.push({ id: uuid(900), mediaType: "IMAGE", isPrimary: true, visibility: "PUBLIC" });
    fake.prices.push({ pricingProfile: "STANDARD", isActive: true });

    await publishVehicle(staffActor(), vehicle.id);
    const stored = await getVehicle(staffActor(), vehicle.id);
    expect(stored?.isPublished).toBe(true);
    expect(stored?.publishedAt).toBeInstanceOf(Date);
    expect(auditEntries.map((entry) => entry.action)).toEqual(["vehicle.publish"]);
    expect(auditEntries[0]?.entityId).toBe(vehicle.id);
  });

  it("calcule les manques de l'invariant de publication", () => {
    const vehicle = {
      brandId: BRAND,
      modelId: MODEL,
      year: 2026,
      condition: "USED" as const,
      logisticsLocation: "SENEGAL" as const,
    };

    expect(publicationGaps(vehicle, [], [])).toEqual([
      "média image principal public",
      "prix actif STANDARD",
    ]);
    expect(
      publicationGaps(
        vehicle,
        [{ id: "m", mediaType: "IMAGE", isPrimary: true, visibility: "PRIVATE" }],
        [{ pricingProfile: "STANDARD", isActive: false }],
      ),
    ).toEqual(["média image principal public", "prix actif STANDARD"]);
    expect(
      publicationGaps(
        vehicle,
        [{ id: "m", mediaType: "IMAGE", isPrimary: true, visibility: "PUBLIC" }],
        [{ pricingProfile: "STANDARD", isActive: true }],
      ),
    ).toEqual([]);
  });

  it("retire la publication avec motif obligatoire (vehicle.withdraw)", async () => {
    const vehicle = await persistedVehicle();
    fake.media.push({ id: uuid(901), mediaType: "IMAGE", isPrimary: true, visibility: "PUBLIC" });
    fake.prices.push({ pricingProfile: "STANDARD", isActive: true });
    await publishVehicle(staffActor(), vehicle.id);

    await expect(unpublishVehicle(staffActor(), vehicle.id)).rejects.toMatchObject({
      code: "VALIDATION",
    });

    await unpublishVehicle(staffActor(), vehicle.id, "Erreur de prix.");
    const stored = await getVehicle(staffActor(), vehicle.id);
    expect(stored?.isPublished).toBe(false);
    expect(auditEntries.map((entry) => entry.action)).toEqual([
      "vehicle.publish",
      "vehicle.withdraw",
    ]);
  });

  it("contrôle les transitions commerciales et audite les transitions sensibles", async () => {
    const vehicle = await persistedVehicle();

    await expect(
      changeCommercialStatus(staffActor(), vehicle.id, "SOLD"),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await changeCommercialStatus(staffActor(), vehicle.id, "AVAILABLE");
    expect((await getVehicle(staffActor(), vehicle.id))?.commercialStatus).toBe("AVAILABLE");
    expect(auditEntries).toHaveLength(0);

    await expect(
      changeCommercialStatus(staffActor(), vehicle.id, "RESERVED"),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await changeCommercialStatus(staffActor(), vehicle.id, "RESERVED", "Acompte reçu.");
    expect(auditEntries.map((entry) => entry.action)).toEqual(["vehicle.reserve"]);
    expect(auditEntries[0]?.reason).toBe("Acompte reçu.");

    await expect(
      changeCommercialStatus(staffActor(["vehicle.view"]), vehicle.id, "SOLD", "Vendu."),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      changeCommercialStatus(staffActor(), vehicle.id, "ARCHIVED", "Doublon."),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("archive avec motif obligatoire, retire la publication et audite le retrait", async () => {
    const vehicle = await persistedVehicle();

    await expect(archiveVehicle(staffActor(), vehicle.id)).rejects.toMatchObject({ code: "VALIDATION" });

    await archiveVehicle(staffActor(), vehicle.id, "Retiré du catalogue.");
    const stored = await getVehicle(staffActor(), vehicle.id);
    expect(stored?.commercialStatus).toBe("ARCHIVED");
    expect(stored?.archivedAt).toBeInstanceOf(Date);
    expect(stored?.isPublished).toBe(false);
    expect(auditEntries.map((entry) => entry.action)).toEqual(["vehicle.withdraw"]);
  });

  it("renvoie null pour une fiche inexistante", async () => {
    expect(await getVehicle(staffActor(), MISSING)).toBeNull();
  });
});

describe("vehicle publication projection", () => {
  it("n'expose aucune donnée d'approvisionnement dans la projection publique", () => {
    const record: VehicleRecord = {
      id: uuid(1),
      reference: "DBC-2026-000001",
      slug: "toyota-land-cruiser-2026-000001",
      title: "Toyota Land Cruiser",
      description: null,
      brandId: BRAND,
      modelId: MODEL,
      year: 2026,
      condition: "USED",
      logisticsLocation: "SENEGAL",
      commercialStatus: "AVAILABLE",
      isPublished: true,
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      archivedAt: null,
    };

    const projected = projectPublicVehicle(record) as Record<string, unknown>;
    for (const field of ["supplierReference", "supplierName", "sourceType", "sourceUrl", "id"]) {
      expect(projected).not.toHaveProperty(field);
    }

    const publicColumns = Object.keys(publicVehicleSelect);
    for (const sensitive of SENSITIVE_VEHICLE_FIELDS) {
      expect(publicColumns).not.toContain(sensitive);
    }
  });
});