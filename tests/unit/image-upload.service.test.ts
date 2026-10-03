import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { MAX_IMAGES_PER_VEHICLE } from "@/lib/media-constants";
import type { VehicleStorageService } from "@/lib/storage/vehicle-storage";
import type { MediaRow } from "@/services/media.service";
import { configureMediaRepository } from "@/services/media.service";
import { staffActor } from "@/tests/unit/support/actors";
import { fakeMediaRepository, mediaUuid } from "@/tests/unit/support/media-repository.fake";

// --- Doubles : stockage en mémoire et téléchargement distant --------------------------------------

const mocks = vi.hoisted(() => ({
  files: new Map<string, Buffer>(),
  fetchRemoteImage: vi.fn(),
}));

function memoryStorage(): VehicleStorageService {
  return {
    bucket: "vehicle-images",
    async createSignedUrl(path) {
      return `https://signed.example/${path}`;
    },
    async createSignedUploadUrl(path) {
      return { bucket: "vehicle-images", path, token: `token-${path}`, signedUrl: `https://upload.example/${path}` };
    },
    async uploadFile(path, data) {
      if (mocks.files.has(path)) throw new AppError("INTERNAL", "Le téléversement du fichier a échoué.");
      mocks.files.set(path, data);
    },
    async downloadFile(path, maxBytes) {
      const data = mocks.files.get(path);
      if (!data) throw new AppError("NOT_FOUND", "Fichier introuvable dans le stockage.");
      if (data.byteLength > maxBytes) throw new AppError("VALIDATION", "Image trop volumineuse.");
      return data;
    },
    async deleteFile(path) {
      mocks.files.delete(path);
    },
  };
}

vi.mock("@/lib/storage/vehicle-storage", () => ({
  readStorageConfig: () => ({ supabaseUrl: "https://x.supabase.co", serviceRoleKey: "k", bucket: "vehicle-images", ttlSeconds: 300 }),
  isVehicleStorageConfigured: () => true,
  createVehicleStorageService: () => memoryStorage(),
}));

vi.mock("@/lib/security/safe-remote-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/safe-remote-fetch")>();
  return { ...actual, fetchRemoteImage: mocks.fetchRemoteImage };
});

const {
  addImagesFromUrls,
  finalizeImageUploads,
  reoptimizeImage,
  requestImageUploads,
} = await import("@/services/image-upload.service");
const { RemoteFetchError } = await import("@/lib/security/safe-remote-fetch");

// --- Données de test -----------------------------------------------------------------------------

const VEHICLE = "11111111-1111-4111-8111-111111111111";
const OTHER_VEHICLE = "22222222-2222-4222-8222-222222222222";
const STAGING = (id: string, vehicle = VEHICLE) => `staging/${vehicle}/${id}`;
const FILE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FILE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function bigPhoto() {
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#336699" } })
    .jpeg({ quality: 100 })
    .toBuffer();
}

function imageRow(n: number, overrides: Partial<MediaRow> = {}): MediaRow {
  return {
    id: mediaUuid(900 + n),
    vehicleId: VEHICLE,
    mediaType: "IMAGE",
    storagePath: `vehicles/${VEHICLE}/old-${n}.webp`,
    externalUrl: null,
    thumbnailPath: `vehicles/${VEHICLE}/thumbs/old-${n}.webp`,
    category: null,
    displayOrder: n,
    isPrimary: n === 1,
    visibility: "PUBLIC",
    ...overrides,
  };
}

let repo: ReturnType<typeof fakeMediaRepository>;

function useRepo(initial: MediaRow[] = []) {
  repo = fakeMediaRepository(initial);
  configureMediaRepository(repo.repository);
}

beforeEach(() => {
  mocks.files.clear();
  mocks.fetchRemoteImage.mockReset();
  useRepo();
});

// --- Envoi depuis l'ordinateur ---------------------------------------------------------------------

describe("requestImageUploads", () => {
  it("renvoie des cibles signées dans le dossier temporaire du véhicule", async () => {
    const { bucket, targets } = await requestImageUploads(staffActor(), VEHICLE, 3);

    expect(bucket).toBe("vehicle-images");
    expect(targets).toHaveLength(3);
    for (const target of targets) {
      expect(target.path).toMatch(new RegExp(`^staging/${VEHICLE}/[0-9a-f-]{36}$`));
      expect(target.token).toBeTruthy();
    }
    expect(new Set(targets.map((target) => target.path)).size).toBe(3);
  });

  it("refuse un lot qui dépasserait la limite, en tenant compte des images existantes", async () => {
    useRepo([1, 2, 3, 4].map((n) => imageRow(n)));

    await expect(requestImageUploads(staffActor(), VEHICLE, 2)).rejects.toMatchObject({
      code: "VALIDATION",
      message: expect.stringMatching(/maximum/i),
    });
    await expect(requestImageUploads(staffActor(), VEHICLE, 1)).resolves.toMatchObject({
      targets: [expect.anything()],
    });
  });

  it("refuse 0 image, un lot trop gros et un identifiant invalide", async () => {
    await expect(requestImageUploads(staffActor(), VEHICLE, 0)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(requestImageUploads(staffActor(), VEHICLE, MAX_IMAGES_PER_VEHICLE + 1)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(requestImageUploads(staffActor(), "pas-un-uuid", 1)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("exige la permission vehicle.edit", async () => {
    await expect(requestImageUploads(staffActor(["vehicle.view"]), VEHICLE, 1)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("finalizeImageUploads", () => {
  it("optimise le fichier déposé, l'enregistre et supprime le temporaire", async () => {
    const photo = await bigPhoto();
    mocks.files.set(STAGING(FILE_A), photo);

    const [result] = await finalizeImageUploads(staffActor(), VEHICLE, [{ path: STAGING(FILE_A), name: "IMG_0001.jpg" }]);

    expect(result).toMatchObject({ ok: true, source: "IMG_0001.jpg", originalBytes: photo.byteLength });
    if (!result?.ok) throw new Error("échec inattendu");
    expect(result.optimizedBytes).toBeLessThan(result.originalBytes);

    // Fichier brut supprimé, version optimisée + vignette présentes.
    expect(mocks.files.has(STAGING(FILE_A))).toBe(false);
    const stored = [...mocks.files.keys()];
    expect(stored).toHaveLength(2);
    expect(stored.some((path) => path.startsWith(`vehicles/${VEHICLE}/thumbs/`))).toBe(true);
    expect(stored.every((path) => path.endsWith(".webp"))).toBe(true);

    // Média enregistré, public, et principal car premier.
    const rows = repo.all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ mediaType: "IMAGE", visibility: "PUBLIC", isPrimary: true, storagePath: result.storagePath });
  });

  it("refuse un chemin qui n'appartient pas au véhicule, sans rien lire ni supprimer", async () => {
    mocks.files.set(STAGING(FILE_A, OTHER_VEHICLE), await bigPhoto());
    mocks.files.set(`vehicles/${VEHICLE}/existing.webp`, Buffer.from("autre image"));

    const results = await finalizeImageUploads(staffActor(), VEHICLE, [
      { path: STAGING(FILE_A, OTHER_VEHICLE) }, // véhicule voisin
      { path: `vehicles/${VEHICLE}/existing.webp` }, // fichier définitif existant
      { path: `staging/${VEHICLE}/../${OTHER_VEHICLE}/${FILE_A}` }, // remontée de dossier
      { path: "staging/" + VEHICLE + "/pas-un-identifiant" },
    ]);

    expect(results.every((result) => !result.ok)).toBe(true);
    expect(results.every((result) => !result.ok && result.error === "Fichier non reconnu.")).toBe(true);
    expect(mocks.files.size).toBe(2);
    expect(repo.all()).toHaveLength(0);
  });

  it("rejette un fichier qui n'est pas une image et nettoie quand même le temporaire", async () => {
    mocks.files.set(STAGING(FILE_A), Buffer.from("<html>pas une image</html>"));

    const [result] = await finalizeImageUploads(staffActor(), VEHICLE, [{ path: STAGING(FILE_A), name: "faux.jpg" }]);

    expect(result).toMatchObject({ ok: false, source: "faux.jpg", error: expect.stringMatching(/Format non supporté/) });
    expect(mocks.files.size).toBe(0);
    expect(repo.all()).toHaveLength(0);
  });

  it("signale un fichier jamais déposé sans bloquer les autres", async () => {
    mocks.files.set(STAGING(FILE_B), await bigPhoto());

    const results = await finalizeImageUploads(staffActor(), VEHICLE, [
      { path: STAGING(FILE_A), name: "absent.jpg" },
      { path: STAGING(FILE_B), name: "present.jpg" },
    ]);

    expect(results[0]).toMatchObject({ ok: false, source: "absent.jpg" });
    expect(results[1]).toMatchObject({ ok: true, source: "present.jpg" });
  });

  it("ne laisse aucun fichier orphelin quand la limite est atteinte entre-temps", async () => {
    // Deux envois concurrents ont rempli le véhicule après la demande de cibles.
    useRepo([1, 2, 3, 4, 5].map((n) => imageRow(n)));
    mocks.files.set(STAGING(FILE_A), await bigPhoto());

    const [result] = await finalizeImageUploads(staffActor(), VEHICLE, [{ path: STAGING(FILE_A), name: "sixieme.jpg" }]);

    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/Limite de 5 images/) });
    expect(mocks.files.size).toBe(0);
    expect(repo.all()).toHaveLength(5);
  });

  it("exige la permission, au moins un fichier et au plus 5", async () => {
    await expect(
      finalizeImageUploads(staffActor(["vehicle.view"]), VEHICLE, [{ path: STAGING(FILE_A) }]),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(finalizeImageUploads(staffActor(), VEHICLE, [])).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      finalizeImageUploads(staffActor(), VEHICLE, Array.from({ length: 6 }, () => ({ path: STAGING(FILE_A) }))),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

// --- Envoi par URL ----------------------------------------------------------------------------------

describe("addImagesFromUrls", () => {
  it("télécharge, optimise et enregistre", async () => {
    const photo = await bigPhoto();
    mocks.fetchRemoteImage.mockResolvedValue({ buffer: photo, contentType: "image/jpeg", finalUrl: "https://cdn.example.com/a.jpg" });

    const [result] = await addImagesFromUrls(staffActor(), VEHICLE, ["https://cdn.example.com/a.jpg"]);

    expect(result).toMatchObject({ ok: true, source: "https://cdn.example.com/a.jpg", originalBytes: photo.byteLength });
    expect(repo.all()).toHaveLength(1);
    expect(mocks.fetchRemoteImage).toHaveBeenCalledWith(
      "https://cdn.example.com/a.jpg",
      expect.objectContaining({ maxBytes: expect.any(Number), acceptContentType: expect.any(Function) }),
    );
  });

  it("affiche le message d'un refus de téléchargement, sans bloquer les autres liens", async () => {
    const photo = await bigPhoto();
    mocks.fetchRemoteImage
      .mockRejectedValueOnce(new RemoteFetchError("Adresse réseau non autorisée."))
      .mockResolvedValueOnce({ buffer: photo, contentType: "image/jpeg", finalUrl: "https://cdn.example.com/b.jpg" });

    const results = await addImagesFromUrls(staffActor(), VEHICLE, ["https://10.0.0.1/a.jpg", "https://cdn.example.com/b.jpg"]);

    expect(results[0]).toMatchObject({ ok: false, error: "Adresse réseau non autorisée." });
    expect(results[1]).toMatchObject({ ok: true });
  });

  it("ne divulgue jamais le détail d'une erreur inattendue", async () => {
    mocks.fetchRemoteImage.mockRejectedValue(new Error("connect ECONNREFUSED 10.1.2.3:5432 secret-internal-host"));

    const [result] = await addImagesFromUrls(staffActor(), VEHICLE, ["https://cdn.example.com/a.jpg"]);

    expect(result).toEqual({ ok: false, source: "https://cdn.example.com/a.jpg", error: "Erreur inattendue." });
  });

  it("refuse un lot trop grand avant de télécharger quoi que ce soit", async () => {
    useRepo([1, 2, 3, 4].map((n) => imageRow(n)));

    await expect(
      addImagesFromUrls(staffActor(), VEHICLE, ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"]),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(mocks.fetchRemoteImage).not.toHaveBeenCalled();
  });

  it("exige la permission vehicle.edit avant tout téléchargement", async () => {
    await expect(
      addImagesFromUrls(staffActor(["vehicle.view"]), VEHICLE, ["https://cdn.example.com/a.jpg"]),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.fetchRemoteImage).not.toHaveBeenCalled();
  });
});

// --- Ré-optimisation ---------------------------------------------------------------------------------

describe("reoptimizeImage", () => {
  it("recompresse une image lourde, conserve l'identifiant et supprime les anciens fichiers", async () => {
    const row = imageRow(1);
    useRepo([row]);
    const heavy = await bigPhoto();
    mocks.files.set(row.storagePath as string, heavy);
    mocks.files.set(row.thumbnailPath as string, Buffer.from("ancienne vignette"));

    const result = await reoptimizeImage(staffActor(), row.id);

    expect(result).toMatchObject({ ok: true, changed: true, beforeBytes: heavy.byteLength });
    const updated = repo.all()[0];
    expect(updated?.id).toBe(row.id);
    expect(updated?.isPrimary).toBe(true);
    expect(updated?.storagePath).not.toBe(row.storagePath);
    expect(mocks.files.has(row.storagePath as string)).toBe(false);
    expect(mocks.files.has(row.thumbnailPath as string)).toBe(false);
    expect(mocks.files.has(updated?.storagePath as string)).toBe(true);
    expect(mocks.files.has(updated?.thumbnailPath as string)).toBe(true);
  });

  it("ne recompresse pas une image déjà optimisée dont la vignette est à jour", async () => {
    const row = imageRow(1);
    useRepo([row]);
    const already = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#336699" } })
      .webp({ quality: 60 })
      .toBuffer();
    mocks.files.set(row.storagePath as string, already);
    mocks.files.set(
      row.thumbnailPath as string,
      await sharp({ create: { width: 800, height: 600, channels: 3, background: "#336699" } }).webp().toBuffer(),
    );

    const result = await reoptimizeImage(staffActor(), row.id);

    expect(result).toMatchObject({ ok: true, changed: false });
    expect(repo.all()[0]?.storagePath).toBe(row.storagePath);
    expect(mocks.files.size).toBe(2);
  });

  it("régénère une vignette d'ancienne génération même si l'image principale n'a rien à gagner", async () => {
    const row = imageRow(1);
    useRepo([row]);
    mocks.files.set(
      row.storagePath as string,
      await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#336699" } })
        .webp({ quality: 60 })
        .toBuffer(),
    );
    // Vignette 400×300 : produite avant l'élargissement à 800 px.
    mocks.files.set(
      row.thumbnailPath as string,
      await sharp({ create: { width: 400, height: 300, channels: 3, background: "#336699" } }).webp().toBuffer(),
    );

    const result = await reoptimizeImage(staffActor(), row.id);

    expect(result).toMatchObject({ ok: true, changed: true });
    const updated = repo.all()[0];
    expect(updated?.thumbnailPath).not.toBe(row.thumbnailPath);
    expect(mocks.files.has(row.thumbnailPath as string)).toBe(false);

    const refreshed = mocks.files.get(updated?.thumbnailPath as string);
    expect((await sharp(refreshed as Buffer).metadata()).width).toBe(800);
  });

  it("refuse une vidéo et un acteur sans droit d'édition", async () => {
    const video = imageRow(1, { mediaType: "VIDEO", storagePath: null, thumbnailPath: null, externalUrl: "https://example.com/a.mp4" });
    useRepo([video]);

    await expect(reoptimizeImage(staffActor(), video.id)).resolves.toMatchObject({ ok: false });
    await expect(reoptimizeImage(staffActor(["vehicle.view"]), video.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
