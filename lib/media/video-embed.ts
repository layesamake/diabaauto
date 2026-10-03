/**
 * Reconnaissance des liens vidéo YouTube et Vimeo.
 *
 * La fiche publique ne charge AUCUNE ressource tierce tant que le visiteur n'a pas cliqué sur
 * Lecture : ce module ne fait que reconnaître un lien et construire l'URL d'intégration
 * correspondante. C'est la galerie qui décide du moment où elle est réellement demandée.
 *
 * YouTube passe par `youtube-nocookie.com` : pas de cookie de suivi tant que la vidéo n'est pas
 * lancée. Les deux domaines produits ici sont les seuls autorisés par `frame-src`
 * (`lib/security/http-headers.ts`) — ajouter un hébergeur suppose d'ouvrir aussi la politique.
 *
 * Module pur, sans dépendance : un lien non reconnu renvoie `null`, et l'appelant se rabat sur le
 * lecteur natif (utile pour un fichier `.mp4` déposé dans le stockage).
 */

export type VideoProvider = "youtube" | "vimeo";

export type VideoEmbed = {
  provider: VideoProvider;
  /** Identifiant de la vidéo chez l'hébergeur. */
  id: string;
  /** URL à placer dans l'iframe, avec lecture immédiate (le visiteur vient de cliquer). */
  embedUrl: string;
};

/** Identifiant YouTube : 11 caractères du jeu base64url. */
const YOUTUBE_ID = /^[\w-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

/** Segment de chemin utile : « /embed/ID », « /shorts/ID », « /v/ID », « /video/ID » ou « /ID ». */
function pathId(pathname: string, prefixes: readonly string[]): string | null {
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return null;
  }

  const first = segments[0] ?? "";
  if (prefixes.includes(first)) {
    return segments[1] ?? null;
  }

  return segments.length === 1 ? first : null;
}

function youtubeEmbed(id: string): VideoEmbed {
  // `rel=0` limite les suggestions à la même chaîne en fin de lecture.
  return {
    provider: "youtube",
    id,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
  };
}

function vimeoEmbed(id: string): VideoEmbed {
  return {
    provider: "vimeo",
    id,
    embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1`,
  };
}

/**
 * Reconnaît un lien YouTube ou Vimeo et renvoie son URL d'intégration ; `null` sinon.
 *
 * Seul `https` est accepté : un lien en clair n'a pas à être intégré dans une page servie en HTTPS.
 */
export function parseVideoEmbed(rawUrl: string | null | undefined): VideoEmbed | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") {
    return null;
  }

  const host = url.hostname.toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return YOUTUBE_ID.test(id) ? youtubeEmbed(id) : null;
  }

  if (YOUTUBE_HOSTS.has(host)) {
    // Forme « /watch?v=ID », la plus courante.
    const fromQuery = url.searchParams.get("v");
    if (fromQuery && YOUTUBE_ID.test(fromQuery)) {
      return youtubeEmbed(fromQuery);
    }

    const fromPath = pathId(url.pathname, ["embed", "shorts", "v", "live"]);
    return fromPath && YOUTUBE_ID.test(fromPath) ? youtubeEmbed(fromPath) : null;
  }

  if (VIMEO_HOSTS.has(host)) {
    const id = pathId(url.pathname, ["video"]);
    return id && VIMEO_ID.test(id) ? vimeoEmbed(id) : null;
  }

  return null;
}
