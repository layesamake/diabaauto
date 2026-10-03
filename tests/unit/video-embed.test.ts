import { describe, expect, it } from "vitest";
import { parseVideoEmbed } from "@/lib/media/video-embed";

/**
 * Reconnaissance des liens vidéo.
 *
 * Deux exigences : accepter les formes réellement collées par un commercial (lien de partage, lien
 * de la barre d'adresse, Shorts…), et n'intégrer QUE les deux hébergeurs autorisés par `frame-src`.
 * Tout le reste doit retomber sur `null` — un lien non reconnu ne doit jamais finir dans une iframe.
 */

describe("parseVideoEmbed — YouTube", () => {
  it.each([
    ["https://youtu.be/yNjOOybz1t8", "yNjOOybz1t8"],
    ["https://www.youtube.com/watch?v=yNjOOybz1t8", "yNjOOybz1t8"],
    ["https://youtube.com/watch?v=yNjOOybz1t8&t=42s", "yNjOOybz1t8"],
    ["https://m.youtube.com/watch?v=yNjOOybz1t8", "yNjOOybz1t8"],
    ["https://www.youtube.com/embed/yNjOOybz1t8", "yNjOOybz1t8"],
    ["https://www.youtube.com/shorts/yNjOOybz1t8", "yNjOOybz1t8"],
    ["https://www.youtube.com/live/yNjOOybz1t8", "yNjOOybz1t8"],
    ["https://youtu.be/yNjOOybz1t8?si=abcdef", "yNjOOybz1t8"],
    ["  https://youtu.be/yNjOOybz1t8  ", "yNjOOybz1t8"],
    ["https://youtu.be/a_B-c1D2e3F", "a_B-c1D2e3F"],
  ])("reconnaît %s", (url, id) => {
    expect(parseVideoEmbed(url)).toEqual({
      provider: "youtube",
      id,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
    });
  });

  it("intègre toujours par youtube-nocookie.com, jamais youtube.com", () => {
    const embed = parseVideoEmbed("https://www.youtube.com/watch?v=yNjOOybz1t8");

    expect(embed?.embedUrl.startsWith("https://www.youtube-nocookie.com/")).toBe(true);
    expect(embed?.embedUrl).not.toContain("//www.youtube.com");
  });
});

describe("parseVideoEmbed — Vimeo", () => {
  it.each([
    ["https://vimeo.com/123456789", "123456789"],
    ["https://www.vimeo.com/123456789", "123456789"],
    ["https://player.vimeo.com/video/123456789", "123456789"],
  ])("reconnaît %s", (url, id) => {
    expect(parseVideoEmbed(url)).toEqual({
      provider: "vimeo",
      id,
      embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1`,
    });
  });
});

describe("parseVideoEmbed — refus", () => {
  it.each([
    ["http://youtu.be/yNjOOybz1t8", "lien en clair"],
    ["https://dailymotion.com/video/x7abcde", "hébergeur non autorisé"],
    ["https://example.com/watch?v=yNjOOybz1t8", "domaine quelconque imitant YouTube"],
    ["https://youtu.be.attacker.com/yNjOOybz1t8", "sous-domaine trompeur"],
    ["https://youtu.be/trop-court", "identifiant invalide"],
    ["https://www.youtube.com/watch?v=../../etc", "identifiant piégé"],
    ["https://www.youtube.com/", "aucune vidéo"],
    ["https://vimeo.com/pas-un-nombre", "identifiant Vimeo invalide"],
    ["https://storage.example.com/video.mp4", "fichier direct"],
    ["pas une url", "texte libre"],
    ["javascript:alert(1)", "schéma dangereux"],
    ["", "vide"],
  ])("refuse %s (%s)", (url) => {
    expect(parseVideoEmbed(url)).toBeNull();
  });

  it("refuse une valeur absente", () => {
    expect(parseVideoEmbed(null)).toBeNull();
    expect(parseVideoEmbed(undefined)).toBeNull();
  });

  it("n'intègre jamais un domaine hors des deux hébergeurs autorisés", () => {
    const refused = [
      "https://evil.com/embed/yNjOOybz1t8",
      "https://youtube.com.evil.com/watch?v=yNjOOybz1t8",
      "https://player.vimeo.com.evil.com/video/123456789",
    ];

    for (const url of refused) {
      expect(parseVideoEmbed(url), url).toBeNull();
    }
  });
});
