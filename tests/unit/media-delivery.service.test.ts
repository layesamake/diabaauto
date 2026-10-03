import { describe, expect, it, vi } from "vitest";
import {
  parseMediaVariant,
  resolveMediaRedirect,
  type MediaDeliveryDependencies,
  type PublicMediaRecord,
} from "@/services/media-delivery.service";

const ID = "11111111-1111-4111-8111-111111111111";

function deps(record: PublicMediaRecord | null, ttlSeconds = 300) {
  const findPublicMedia = vi.fn(async () => record);
  const signUrl = vi.fn(async (path: string, ttl: number) => `https://signed.test/${path}?ttl=${ttl}`);
  const dependencies: MediaDeliveryDependencies = { findPublicMedia, signUrl, ttlSeconds };
  return { dependencies, findPublicMedia, signUrl };
}

describe("resolveMediaRedirect", () => {
  it("signe le fichier d'un média public et borne le cache sous la validité de l'URL", async () => {
    const { dependencies, signUrl } = deps({ storagePath: "byd/seal.jpg", thumbnailPath: "byd/seal-t.jpg" });

    const result = await resolveMediaRedirect(ID, null, dependencies);

    expect(result).toEqual({ url: "https://signed.test/byd/seal.jpg?ttl=300", cacheSeconds: 150 });
    expect(signUrl).toHaveBeenCalledWith("byd/seal.jpg", 300);
    expect(result!.cacheSeconds).toBeLessThan(300);
  });

  it("signe la vignette pour ?v=thumb", async () => {
    const { dependencies, signUrl } = deps({ storagePath: "byd/seal.jpg", thumbnailPath: "byd/seal-t.jpg" });

    await resolveMediaRedirect(ID, "thumb", dependencies);

    expect(signUrl).toHaveBeenCalledWith("byd/seal-t.jpg", 300);
  });

  it("retourne null (introuvable) pour un média non public ou d'une fiche non publiée, sans signer", async () => {
    const { dependencies, signUrl } = deps(null);

    expect(await resolveMediaRedirect(ID, null, dependencies)).toBeNull();
    expect(signUrl).not.toHaveBeenCalled();
  });

  it("rejette un identifiant invalide sans interroger la base", async () => {
    const { dependencies, findPublicMedia } = deps({ storagePath: "a.jpg", thumbnailPath: null });

    expect(await resolveMediaRedirect("../../etc/passwd", null, dependencies)).toBeNull();
    expect(await resolveMediaRedirect(undefined, null, dependencies)).toBeNull();
    expect(findPublicMedia).not.toHaveBeenCalled();
  });

  it("retourne null quand la variante demandée n'a pas de fichier", async () => {
    const { dependencies, signUrl } = deps({ storagePath: "a.jpg", thumbnailPath: null });

    expect(await resolveMediaRedirect(ID, "thumb", dependencies)).toBeNull();
    expect(signUrl).not.toHaveBeenCalled();
  });

  it("propage une panne de signature (l'appelant répond 503, pas 404)", async () => {
    const { dependencies } = deps({ storagePath: "a.jpg", thumbnailPath: null });
    dependencies.signUrl = vi.fn(async () => {
      throw new Error("storage down");
    });

    await expect(resolveMediaRedirect(ID, null, dependencies)).rejects.toThrow("storage down");
  });
});

describe("parseMediaVariant", () => {
  it("ne reconnaît que thumb", () => {
    expect(parseMediaVariant("thumb")).toBe("thumb");
    expect(parseMediaVariant("full")).toBe("full");
    expect(parseMediaVariant("../x")).toBe("full");
    expect(parseMediaVariant(null)).toBe("full");
  });
});
