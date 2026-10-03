import dns from "node:dns";
import type { IncomingMessage } from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";

/**
 * Téléchargement sécurisé d'une ressource distante (images ajoutées par URL dans le back-office).
 *
 * Le serveur ne doit jamais devenir un relais vers le réseau interne (SSRF). Garde-fous :
 * - HTTPS uniquement, port 443, sans identifiants dans l'URL ;
 * - le nom d'hôte est résolu AU MOMENT de la connexion et chaque adresse obtenue est vérifiée
 *   (boucle locale, réseaux privés, lien-local, CGNAT, métadonnées cloud, multicast, réservées,
 *   IPv6 unique-local, IPv4 enveloppée dans de l'IPv6…). Vérifier à la connexion — et non avant —
 *   empêche le « DNS rebinding » : l'adresse contrôlée est celle qui sert réellement ;
 * - les redirections sont suivies à la main (3 maximum) et chaque destination repasse par les mêmes
 *   contrôles ;
 * - délai global et taille maximale appliqués pendant la lecture du flux, pas après.
 *
 * Module sans dépendance applicative : `deps` permet d'injecter la résolution DNS et le transport
 * HTTPS dans les tests.
 */

export class RemoteFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteFetchError";
  }
}

export type RemoteFetchResult = {
  buffer: Buffer;
  contentType: string | null;
  finalUrl: string;
};

export type RemoteFetchOptions = {
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Retourne `true` si le Content-Type annoncé est acceptable (le contenu réel est revérifié ensuite). */
  acceptContentType: (contentType: string | null) => boolean;
};

export type RemoteFetchDeps = {
  lookup?: typeof dns.lookup;
  request?: typeof https.request;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;
const MAX_URL_LENGTH = 2048;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// ---------------------------------------------------------------------------
// Adresses interdites
// ---------------------------------------------------------------------------

const blockedRanges = new BlockList();

const BLOCKED_IPV4: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], // « ce réseau »
  ["10.0.0.0", 8], // privé
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // boucle locale
  ["169.254.0.0", 16], // lien-local, dont les métadonnées cloud (169.254.169.254)
  ["172.16.0.0", 12], // privé
  ["192.0.0.0", 24], // protocole IETF
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // privé
  ["198.18.0.0", 15], // tests de performance
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // réservé, dont 255.255.255.255
];

const BLOCKED_IPV6: ReadonlyArray<readonly [string, number]> = [
  ["::", 128], // non spécifiée
  ["::1", 128], // boucle locale
  ["64:ff9b::", 96], // NAT64 : peut mener vers de l'IPv4 privé
  ["100::", 64], // discard
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique-local
  ["fe80::", 10], // lien-local
  ["ff00::", 8], // multicast
];

for (const [network, prefix] of BLOCKED_IPV4) blockedRanges.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of BLOCKED_IPV6) blockedRanges.addSubnet(network, prefix, "ipv6");

/** Extrait l'IPv4 d'une adresse IPv6 « enveloppée » (::ffff:a.b.c.d ou ::ffff:7f00:1), sinon `null`. */
function unwrapMappedIpv4(address: string): string | null {
  const match = /^(?:0{0,4}:){0,5}:?ffff:(.+)$/i.exec(address);
  const tail = match?.[1];
  if (!tail) return null;

  if (isIP(tail) === 4) return tail;

  const groups = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(tail);
  if (!groups?.[1] || !groups[2]) return null;

  const high = Number.parseInt(groups[1], 16);
  const low = Number.parseInt(groups[2], 16);
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

/** `true` si l'adresse est interdite, ou n'est pas une adresse IP valide (refus par défaut). */
export function isBlockedIp(address: string): boolean {
  const clean = address.trim().replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  const family = isIP(clean);

  if (family === 0) return true;
  if (family === 4) return blockedRanges.check(clean, "ipv4");

  const mapped = unwrapMappedIpv4(clean);
  if (mapped) return blockedRanges.check(mapped, "ipv4");

  return blockedRanges.check(clean, "ipv6");
}

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa"];

/** Valide une URL fournie par un utilisateur ; lève `RemoteFetchError` avec un message affichable. */
export function parseRemoteImageUrl(raw: string): URL {
  if (raw.length > MAX_URL_LENGTH) {
    throw new RemoteFetchError("URL trop longue.");
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new RemoteFetchError("URL invalide.");
  }

  if (url.protocol !== "https:") {
    throw new RemoteFetchError("Seules les URL en HTTPS sont acceptées.");
  }
  if (url.username || url.password) {
    throw new RemoteFetchError("L'URL ne doit pas contenir d'identifiants.");
  }
  if (url.port && url.port !== "443") {
    throw new RemoteFetchError("Seul le port HTTPS standard est accepté.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname) {
    throw new RemoteFetchError("URL invalide.");
  }
  if (
    hostname === "localhost" ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
    (isIP(hostname) !== 0 && isBlockedIp(hostname))
  ) {
    throw new RemoteFetchError("Adresse réseau non autorisée.");
  }

  return url;
}

// ---------------------------------------------------------------------------
// Téléchargement
// ---------------------------------------------------------------------------

/** Fonction `lookup` passée à `https.request` : résout puis refuse toute adresse interdite. */
function createSafeLookup(resolver: typeof dns.lookup) {
  return (
    hostname: string,
    options: { all?: boolean } | number | undefined,
    callback: (...args: unknown[]) => void,
  ): void => {
    const wantsAll = typeof options === "object" && options !== null && options.all === true;

    resolver(hostname, { all: true }, (error, addresses) => {
      if (error) {
        callback(new RemoteFetchError("Adresse introuvable."));
        return;
      }

      const list = Array.isArray(addresses) ? addresses : [];
      if (list.length === 0 || list.some((entry) => isBlockedIp(entry.address))) {
        callback(new RemoteFetchError("Adresse réseau non autorisée."));
        return;
      }

      if (wantsAll) {
        callback(null, list);
        return;
      }

      const first = list[0];
      callback(null, first?.address, first?.family);
    });
  };
}

function formatLimit(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(0)} Mo` : `${Math.round(bytes / 1024)} Ko`;
}

function openResponse(
  url: URL,
  signal: AbortSignal,
  deps: RemoteFetchDeps,
): Promise<IncomingMessage> {
  const request = deps.request ?? https.request;
  const lookup = createSafeLookup(deps.lookup ?? dns.lookup);

  return new Promise<IncomingMessage>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        signal,
        // Types de `lookup` volontairement larges : Node passe `all: true` avec autoSelectFamily.
        lookup: lookup as unknown as https.RequestOptions["lookup"],
        headers: {
          "User-Agent": "DiabaAuto-ImageFetcher/1.0",
          Accept: "image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1",
          // Pas de compression : on lit un flux d'octets plafonné, sans risque de bombe de décompression.
          "Accept-Encoding": "identity",
        },
      },
      resolve,
    );

    req.on("error", reject);
    req.end();
  });
}

async function readCapped(response: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of response) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += piece.byteLength;

    if (total > maxBytes) {
      response.destroy();
      throw new RemoteFetchError(`Image trop volumineuse (max ${formatLimit(maxBytes)}).`);
    }

    chunks.push(piece);
  }

  return Buffer.concat(chunks, total);
}

function translateTransportError(error: unknown): RemoteFetchError {
  if (error instanceof RemoteFetchError) return error;

  const name = error instanceof Error ? error.name : "";
  const code = (error as { code?: string } | null)?.code;

  if (name === "AbortError" || name === "TimeoutError" || code === "ABORT_ERR") {
    return new RemoteFetchError("Délai de téléchargement dépassé.");
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return new RemoteFetchError("Adresse introuvable.");
  }
  if (typeof code === "string" && code.startsWith("ERR_TLS")) {
    return new RemoteFetchError("Certificat du site invalide.");
  }

  // Le détail technique reste côté serveur : il pourrait révéler la topologie interne.
  return new RemoteFetchError("Téléchargement impossible.");
}

/**
 * Télécharge `rawUrl` en appliquant tous les garde-fous. Lève toujours `RemoteFetchError`
 * (message affichable à l'utilisateur) en cas de refus ou d'échec.
 */
export async function fetchRemoteImage(
  rawUrl: string,
  options: RemoteFetchOptions,
  deps: RemoteFetchDeps = {},
): Promise<RemoteFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  // Un seul délai pour l'ensemble : connexion, redirections et lecture du corps.
  const signal = AbortSignal.timeout(timeoutMs);

  let current = parseRemoteImageUrl(rawUrl);

  try {
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const response = await openResponse(current, signal, deps);
      const status = response.statusCode ?? 0;

      if (REDIRECT_STATUSES.has(status)) {
        const location = response.headers.location;
        response.resume();

        if (!location) {
          throw new RemoteFetchError("Redirection invalide.");
        }
        if (hop === maxRedirects) {
          throw new RemoteFetchError("Trop de redirections.");
        }

        // Chaque destination est revalidée comme une URL saisie par l'utilisateur.
        current = parseRemoteImageUrl(new URL(location, current).toString());
        continue;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        throw new RemoteFetchError(`Erreur HTTP ${status}.`);
      }

      const rawType = response.headers["content-type"];
      const contentType = Array.isArray(rawType) ? (rawType[0] ?? null) : (rawType ?? null);
      if (!options.acceptContentType(contentType)) {
        response.resume();
        throw new RemoteFetchError(`Type de contenu non supporté : ${contentType ?? "inconnu"}.`);
      }

      const declared = Number.parseInt(String(response.headers["content-length"] ?? ""), 10);
      if (Number.isFinite(declared) && declared > options.maxBytes) {
        response.resume();
        throw new RemoteFetchError(`Image trop volumineuse (max ${formatLimit(options.maxBytes)}).`);
      }

      const buffer = await readCapped(response, options.maxBytes);
      return { buffer, contentType, finalUrl: current.toString() };
    }

    throw new RemoteFetchError("Trop de redirections.");
  } catch (error) {
    throw translateTransportError(error);
  }
}
