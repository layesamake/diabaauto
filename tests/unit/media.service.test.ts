import { beforeEach, describe, expect, it } from "vitest";
import {
  addMedia,
  canBePrimary,
  configureMediaRepository,
  listMedia,
  parseMedia,
  removeMedia,
  reorderMedia,
  selectPrimaryMedia,
  setPrimaryMedia,
  type MediaRow,
  type VehicleMediaRepository,
} from "@/services/media.service";
import { staffActor, visitorActor } from "@/tests/unit/support/actors";

const VEHICLE = "11111111-1111-4111-8111-111111111111";

/** Identifiants valides (UUID) pour les doubles en mémoire. */
function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

const M1 = "aaaaaaaa-0000-4000-8000-000000000001";
const M2 = "aaaaaaaa-0000-4000-8000-000000000002";
const M3 = "aaaaaaaa-0000-4000-8000-000000000003";

/** Repository en mémoire : reproduit la démarcation du principal et l'ordre d'affichage. */
function fakeMediaRepository(initial: MediaRow[] = []) {
  let items = [...initial];
  let counter = 0;

  const repository: VehicleMediaRepository = {
    async findById(id) {
      return items.find((item) => item.id === id) ?? null;
    },
    async listByVehicle(vehicleId) {
      return items
        .filter((item) => item.vehicleId === vehicleId)
        .sort((left, right) => left.displayOrder - right.displayOrder);
    },
    async create(input) {
      const row: MediaRow = { id: uuid(++counter), ...input };
      items.push(row);
      return row;
    },
    async setPrimary(id, isPrimary) {
      const index = items.findIndex((item) => item.id === id);
      const current = items[index];
      if (!current) throw new Error("media not found");
      const updated = { ...current, isPrimary };
      items[index] = updated;
      return updated;
    },
    async demotePrimary(vehicleId, exceptId) {
      items = items.map((item) =>
        item.vehicleId === vehicleId && item.id !== exceptId ? { ...item, isPrimary: false } : item,
      );
    },
    async setDisplayOrder(id, displayOrder) {
      const index = items.findIndex((item) => item.id === id);
      const current = items[index];
      if (!current) throw new Error("media not found");
      items[index] = { ...current, displayOrder };
    },
    async remove(id) {
      items = items.filter((item) => item.id !== id);
    },
    async transaction(fn) {
      return fn(repository);
    },
  };

  return { repository, all: () => [...items] };
}

function media(overrides: Partial<MediaRow>): MediaRow {
  return {
    id: M1,
    vehicleId: VEHICLE,
    mediaType: "IMAGE",
    storagePath: "vehicles/photo.jpg",
    externalUrl: null,
    thumbnailPath: null,
    category: null,
    displayOrder: 0,
    isPrimary: false,
    visibility: "PUBLIC",
    ...overrides,
  };
}

let fake: ReturnType<typeof fakeMediaRepository>;

beforeEach(() => {
  fake = fakeMediaRepository();
  configureMediaRepository(fake.repository);
});

describe("media service — validation par type", () => {
  it("exige un chemin de stockage pour une image et interdit une URL externe", () => {
    expect(() => parseMedia({ mediaType: "IMAGE" })).toThrowError(/chemin de stockage/i);
    expect(() =>
      parseMedia({ mediaType: "IMAGE", storagePath: "a.jpg", externalUrl: "https://example.com/a.mp4" }),
    ).toThrowError(/URL externe/i);
  });

  it("exige une URL externe pour une vidéo et un storage_path NULL", () => {
    expect(() => parseMedia({ mediaType: "VIDEO" })).toThrowError(/URL externe/i);
    expect(() =>
      parseMedia({
        mediaType: "VIDEO",
        storagePath: "x.mp4",
        externalUrl: "https://example.com/a.mp4",
      }),
    ).toThrowError(/fichier stocké/i);

    const parsed = parseMedia({ mediaType: "VIDEO", externalUrl: "https://example.com/a.mp4" });
    expect(parsed.storagePath).toBeNull();
    expect(parsed.visibility).toBe("PUBLIC");
  });

  it("interdit un média principal qui n'est pas une image publique", () => {
    expect(() =>
      parseMedia({
        mediaType: "VIDEO",
        externalUrl: "https://example.com/a.mp4",
        isPrimary: true,
      }),
    ).toThrowError(/image publique/i);

    expect(() =>
      parseMedia({
        mediaType: "IMAGE",
        storagePath: "a.jpg",
        isPrimary: true,
        visibility: "PRIVATE",
      }),
    ).toThrowError(/image publique/i);
  });

  it("exige la permission vehicle.edit pour écrire", async () => {
    await expect(
      addMedia(visitorActor, VEHICLE, { mediaType: "IMAGE", storagePath: "a.jpg" }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

    await expect(
      addMedia(staffActor(["vehicle.view"]), VEHICLE, { mediaType: "IMAGE", storagePath: "a.jpg" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("media service — média principal unique", () => {
  it("rend principal la première image publique, puis démarque les autres", async () => {
    const first = await addMedia(staffActor(), VEHICLE, {
      mediaType: "IMAGE",
      storagePath: "vehicles/1.jpg",
    });

    const rows = await listMedia(staffActor(), VEHICLE);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isPrimary).toBe(true);
    expect(rows[0]?.displayOrder).toBe(0);

    const second = await addMedia(staffActor(), VEHICLE, {
      mediaType: "IMAGE",
      storagePath: "vehicles/2.jpg",
    });
    expect(second.id).not.toBe(first.id);

    const afterSecond = await listMedia(staffActor(), VEHICLE);
    expect(afterSecond.find((item) => item.id === second.id)?.isPrimary).toBe(false);
    expect(afterSecond.find((item) => item.id === second.id)?.displayOrder).toBe(1);

    const promoted = await addMedia(staffActor(), VEHICLE, {
      mediaType: "IMAGE",
      storagePath: "vehicles/3.jpg",
      isPrimary: true,
    });
    expect(promoted.id).toBeDefined();

    const all = await listMedia(staffActor(), VEHICLE);
    expect(all.filter((item) => item.isPrimary)).toHaveLength(1);
    expect(all.find((item) => item.id === first.id)?.isPrimary).toBe(false);
  });

  it("ne rend jamais principal une vidéo seule", async () => {
    const video = await addMedia(staffActor(), VEHICLE, {
      mediaType: "VIDEO",
      externalUrl: "https://example.com/visite.mp4",
    });

    const all = await listMedia(staffActor(), VEHICLE);
    expect(all.find((item) => item.id === video.id)?.isPrimary).toBe(false);
  });

  it("réattribue le principal au premier média image public après suppression", async () => {
    fake = fakeMediaRepository([
      media({ id: M1, displayOrder: 0, isPrimary: true }),
      media({ id: M2, displayOrder: 1, storagePath: "vehicles/2.jpg" }),
      media({
        id: M3,
        displayOrder: 2,
        mediaType: "VIDEO",
        storagePath: null,
        externalUrl: "https://example.com/a.mp4",
      }),
    ]);
    configureMediaRepository(fake.repository);

    await removeMedia(staffActor(), M1);
    expect(selectPrimaryMedia(fake.all())?.id).toBe(M2);
  });

  it("ne réattribue rien si aucun média image public ne subsiste", async () => {
    fake = fakeMediaRepository([
      media({ id: M1, isPrimary: true }),
      media({ id: M2, isPrimary: false, visibility: "PRIVATE" }),
    ]);
    configureMediaRepository(fake.repository);

    await removeMedia(staffActor(), M1);
    expect(fake.all().some((item) => item.isPrimary)).toBe(false);
  });

  it("rend un média existant principal et démarque l'ancien", async () => {
    fake = fakeMediaRepository([
      media({ id: M1, displayOrder: 0, isPrimary: true }),
      media({ id: M2, displayOrder: 1, storagePath: "vehicles/2.jpg" }),
    ]);
    configureMediaRepository(fake.repository);

    await setPrimaryMedia(staffActor(), M2);
    expect(fake.all().filter((item) => item.isPrimary).map((item) => item.id)).toEqual([M2]);

    await expect(setPrimaryMedia(staffActor(), M3)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuse de rendre principal un média non image publique", async () => {
    fake = fakeMediaRepository([media({ id: M1, visibility: "PRIVATE" })]);
    configureMediaRepository(fake.repository);

    await expect(setPrimaryMedia(staffActor(), M1)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("vérifie l'éligibilité au statut principal", () => {
    expect(canBePrimary({ mediaType: "IMAGE", visibility: "PUBLIC" })).toBe(true);
    expect(canBePrimary({ mediaType: "IMAGE", visibility: "PRIVATE" })).toBe(false);
    expect(canBePrimary({ mediaType: "VIDEO", visibility: "PUBLIC" })).toBe(false);
  });
});

describe("media service — réordonnancement", () => {
  it("réordonne l'ensemble exact des médias du véhicule", async () => {
    fake = fakeMediaRepository([
      media({ id: M1, displayOrder: 0 }),
      media({ id: M2, displayOrder: 1, storagePath: "vehicles/2.jpg" }),
    ]);
    configureMediaRepository(fake.repository);

    const reordered = await reorderMedia(staffActor(), VEHICLE, [M2, M1]);
    expect(reordered.map((item) => item.id)).toEqual([M2, M1]);
    expect(reordered.map((item) => item.displayOrder)).toEqual([0, 1]);
  });

  it("refuse un ensemble incomplet, dupliqué ou étranger au véhicule", async () => {
    fake = fakeMediaRepository([
      media({ id: M1, displayOrder: 0 }),
      media({ id: M2, displayOrder: 1, storagePath: "vehicles/2.jpg" }),
    ]);
    configureMediaRepository(fake.repository);

    await expect(reorderMedia(staffActor(), VEHICLE, [M1])).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(reorderMedia(staffActor(), VEHICLE, [M1, M1])).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(
      reorderMedia(staffActor(), VEHICLE, [M1, "99999999-9999-4999-8999-999999999999"]),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});