import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaRow } from "@/services/media.service";
import { staffActor, visitorActor } from "@/tests/unit/support/actors";

/**
 * Vignettes du back-office.
 *
 * L'enjeu : ces écrans montrent aussi des brouillons et des archives, que la route publique
 * `/api/media` refuse par construction. Les vignettes doivent donc être signées côté serveur, en un
 * seul appel, sans jamais faire tomber l'écran si le stockage est absent ou en panne.
 */

const mocks = vi.hoisted(() => ({
  configured: true,
  createSignedUrls: vi.fn(),
}));

vi.mock("@/lib/storage/vehicle-storage", () => ({
  readStorageConfig: () => ({ supabaseUrl: "https://x.supabase.co", serviceRoleKey: "k", bucket: "vehicle-images", ttlSeconds: 300 }),
  isVehicleStorageConfigured: () => mocks.configured,
  createVehicleStorageService: () => ({ createSignedUrls: mocks.createSignedUrls }),
}));

const { resolveMediaThumbnails } = await import("@/services/media-preview.service");

const VEHICLE = "11111111-1111-4111-8111-111111111111";

function media(overrides: Partial<MediaRow> & { id: string }): MediaRow {
  return {
    vehicleId: VEHICLE,
    mediaType: "IMAGE",
    storagePath: `vehicles/${overrides.id}.webp`,
    externalUrl: null,
    thumbnailPath: `vehicles/thumbs/${overrides.id}.webp`,
    category: null,
    displayOrder: 0,
    isPrimary: false,
    visibility: "PUBLIC",
    ...overrides,
  };
}

/** Le stockage répond en associant chaque chemin demandé à une URL signée. */
function signsEverything() {
  mocks.createSignedUrls.mockImplementation(async (paths: string[]) =>
    new Map(paths.map((path) => [path, `https://signed.example/${path}`])),
  );
}

beforeEach(() => {
  mocks.configured = true;
  mocks.createSignedUrls.mockReset();
  signsEverything();
});

describe("resolveMediaThumbnails — permission", () => {
  it("exige la permission vehicle.view et ne touche pas au stockage sans elle", async () => {
    await expect(resolveMediaThumbnails(visitorActor, [media({ id: "a" })])).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(
      resolveMediaThumbnails(staffActor(["customer.view"]), [media({ id: "a" })]),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.createSignedUrls).not.toHaveBeenCalled();
  });
});

describe("resolveMediaThumbnails — résolution", () => {
  it("signe toutes les images en un seul appel", async () => {
    const rows = [media({ id: "a" }), media({ id: "b" }), media({ id: "c" })];

    const result = await resolveMediaThumbnails(staffActor(), rows);

    expect(result.size).toBe(3);
    expect(result.get("a")).toBe("https://signed.example/vehicles/thumbs/a.webp");
    // Un seul aller-retour, quel que soit le nombre d'images.
    expect(mocks.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(mocks.createSignedUrls.mock.calls[0]?.[0]).toHaveLength(3);
  });

  it("préfère la vignette, et se rabat sur l'image quand elle manque", async () => {
    const rows = [media({ id: "avec" }), media({ id: "sans", thumbnailPath: null })];

    const result = await resolveMediaThumbnails(staffActor(), rows);

    expect(result.get("avec")).toContain("thumbs/avec.webp");
    expect(result.get("sans")).toContain("vehicles/sans.webp");
  });

  it("ignore les vidéos et les images sans fichier", async () => {
    const rows = [
      media({ id: "image" }),
      media({ id: "video", mediaType: "VIDEO", storagePath: null, thumbnailPath: null, externalUrl: "https://example.com/a.mp4" }),
      media({ id: "vide", storagePath: null, thumbnailPath: null }),
    ];

    const result = await resolveMediaThumbnails(staffActor(), rows);

    expect([...result.keys()]).toEqual(["image"]);
  });

  it("résout aussi les médias privés et ceux d'une fiche non publiée", async () => {
    // C'est la raison d'être de ce service : l'aperçu sert AVANT publication.
    const rows = [media({ id: "prive", visibility: "PRIVATE" })];

    const result = await resolveMediaThumbnails(staffActor(), rows);

    expect(result.get("prive")).toBeDefined();
  });

  it("ne demande rien au stockage quand aucun média n'a de fichier", async () => {
    const result = await resolveMediaThumbnails(staffActor(), [
      media({ id: "video", mediaType: "VIDEO", storagePath: null, thumbnailPath: null }),
    ]);

    expect(result.size).toBe(0);
    expect(mocks.createSignedUrls).not.toHaveBeenCalled();
  });
});

describe("resolveMediaThumbnails — l'écran s'affiche toujours", () => {
  it("renvoie une table vide quand le stockage n'est pas configuré", async () => {
    mocks.configured = false;

    const result = await resolveMediaThumbnails(staffActor(), [media({ id: "a" })]);

    expect(result.size).toBe(0);
    expect(mocks.createSignedUrls).not.toHaveBeenCalled();
  });

  it("omet la seule image absente du bucket, sans perdre les autres", async () => {
    mocks.createSignedUrls.mockImplementation(async (paths: string[]) =>
      new Map(paths.filter((path) => !path.includes("manquante")).map((path) => [path, `https://signed.example/${path}`])),
    );

    const result = await resolveMediaThumbnails(staffActor(), [media({ id: "ok" }), media({ id: "manquante" })]);

    expect(result.get("ok")).toBeDefined();
    expect(result.has("manquante")).toBe(false);
  });

  it("ne propage pas une panne de stockage : la page doit rester affichable", async () => {
    mocks.createSignedUrls.mockRejectedValue(new Error("storage down: internal-host:5432"));

    const result = await resolveMediaThumbnails(staffActor(), [media({ id: "a" })]);

    expect(result.size).toBe(0);
  });
});
