import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_FILE_SIZE_BYTES, TARGET_OPTIMIZED_BYTES } from "@/lib/media-constants";
import { isAcceptedContentType, optimizeImage } from "@/services/image-optimization.service";

/** Image unie : se compresse presque à rien, idéale pour tester dimensions et formats. */
function solid(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: "#336699" } });
}

/** Bruit gaussien : quasi incompressible, force la qualité à descendre. */
function noise(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 70 } },
  });
}

async function metaOf(buffer: Buffer) {
  return sharp(buffer).metadata();
}

describe("optimizeImage — résultat", () => {
  it("réduit une grande photo à 1920 px de large, en WebP, avec vignette 400×300", async () => {
    const input = await solid(3000, 2000).jpeg().toBuffer();

    const result = await optimizeImage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { data } = result;
    expect(data.format).toBe("webp");
    expect(data.width).toBe(1920);
    expect(data.height).toBe(1280);
    expect(data.originalBytes).toBe(input.byteLength);
    expect(data.sizeBytes).toBe(data.optimized.byteLength);
    expect(data.sizeBytes).toBeLessThan(data.originalBytes);
    expect(data.quality).toBe(80);

    const optimized = await metaOf(data.optimized);
    expect(optimized.format).toBe("webp");

    const thumb = await metaOf(data.thumbnail);
    expect(thumb.format).toBe("webp");
    expect([thumb.width, thumb.height]).toEqual([400, 300]);
  });

  it("n'agrandit jamais une petite image", async () => {
    const result = await optimizeImage(await solid(800, 600).png().toBuffer());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect([result.data.width, result.data.height]).toEqual([800, 600]);
  });

  it("baisse la qualité par paliers quand la cible de poids n'est pas atteinte", async () => {
    const result = await optimizeImage(await noise(2200, 1500).jpeg({ quality: 70 }).toBuffer());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Le bruit ne passe pas sous 300 Ko : on s'arrête au dernier palier au lieu de boucler.
    expect(result.data.sizeBytes).toBeGreaterThan(TARGET_OPTIMIZED_BYTES);
    expect(result.data.quality).toBe(60);
    expect(result.data.width).toBe(1920);
  });

  it("accepte JPEG, PNG, WebP et AVIF", async () => {
    const inputs = [
      await solid(300, 200).jpeg().toBuffer(),
      await solid(300, 200).png().toBuffer(),
      await solid(300, 200).webp().toBuffer(),
      await solid(300, 200).avif().toBuffer(),
    ];

    for (const input of inputs) {
      const result = await optimizeImage(input);
      expect(result.ok).toBe(true);
    }
  });
});

describe("optimizeImage — orientation et confidentialité", () => {
  it("applique l'orientation EXIF (photo prise en portrait)", async () => {
    // 400×200 marqué « à pivoter de 90° » : l'image réelle est en 200×400.
    const input = await solid(400, 200).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect((await metaOf(input)).orientation).toBe(6);

    const result = await optimizeImage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect([result.data.width, result.data.height]).toEqual([200, 400]);
    expect((await metaOf(result.data.optimized)).orientation ?? 1).toBe(1);
  });

  it("supprime les métadonnées EXIF, dont l'adresse GPS", async () => {
    const input = await solid(600, 400)
      .jpeg()
      .withExif({
        IFD0: { Copyright: "SECRET-COPYRIGHT", Artist: "SECRET-ARTISTE" },
        IFD3: { GPSLatitudeRef: "N", GPSLongitudeRef: "W" },
      })
      .toBuffer();

    const before = await metaOf(input);
    expect(before.exif).toBeDefined();
    expect(input.includes("SECRET-COPYRIGHT")).toBe(true);

    const result = await optimizeImage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = await metaOf(result.data.optimized);
    expect(after.exif).toBeUndefined();
    expect(result.data.optimized.includes("SECRET-COPYRIGHT")).toBe(false);
    expect(result.data.optimized.includes("SECRET-ARTISTE")).toBe(false);
    expect((await metaOf(result.data.thumbnail)).exif).toBeUndefined();
  });
});

describe("optimizeImage — refus", () => {
  it("refuse un fichier qui n'est pas une image, quelle que soit son extension", async () => {
    const result = await optimizeImage(Buffer.from("ceci est un document texte, pas une image"));
    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_TYPE" } });
  });

  it("refuse un SVG et un GIF (hors liste acceptée)", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    expect(await optimizeImage(svg)).toMatchObject({ ok: false, error: { code: "INVALID_TYPE" } });

    const gif = await solid(20, 20).gif().toBuffer();
    expect(await optimizeImage(gif)).toMatchObject({
      ok: false,
      error: { code: "INVALID_TYPE", detectedType: "image/gif" },
    });
  });

  it("refuse un fichier tronqué", async () => {
    const full = await solid(800, 600).jpeg().toBuffer();
    const result = await optimizeImage(full.subarray(0, 40));
    expect(result.ok).toBe(false);
  });

  it("refuse un fichier trop volumineux avant tout traitement", async () => {
    const result = await optimizeImage(Buffer.alloc(MAX_FILE_SIZE_BYTES + 1));
    expect(result).toMatchObject({ ok: false, error: { code: "TOO_LARGE", maxBytes: MAX_FILE_SIZE_BYTES } });
  });

  it("refuse une image aux dimensions démesurées (protection mémoire)", async () => {
    // 8000×8000 = 64 Mpx > limite de 60 Mpx ; un PNG uni de cette taille ne pèse que quelques Ko.
    const huge = await solid(8000, 8000).png({ compressionLevel: 9 }).toBuffer();
    expect(huge.byteLength).toBeLessThan(MAX_FILE_SIZE_BYTES);

    expect(await optimizeImage(huge)).toMatchObject({ ok: false, error: { code: "TOO_MANY_PIXELS" } });
  }, 30_000);
});

describe("isAcceptedContentType", () => {
  it("accepte les types d'image listés, avec paramètres et quelle que soit la casse", () => {
    expect(isAcceptedContentType("image/jpeg")).toBe(true);
    expect(isAcceptedContentType("IMAGE/WebP; charset=binary")).toBe(true);
  });

  it("refuse le reste", () => {
    expect(isAcceptedContentType(null)).toBe(false);
    expect(isAcceptedContentType("image/svg+xml")).toBe(false);
    expect(isAcceptedContentType("text/html")).toBe(false);
  });
});
