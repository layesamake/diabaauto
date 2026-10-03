import { EventEmitter } from "node:events";
import type dns from "node:dns";
import type { IncomingMessage } from "node:http";
import type https from "node:https";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  fetchRemoteImage,
  isBlockedIp,
  parseRemoteImageUrl,
  RemoteFetchError,
  type RemoteFetchDeps,
} from "@/lib/security/safe-remote-fetch";

describe("isBlockedIp", () => {
  it.each([
    "127.0.0.1",
    "127.255.255.254",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // métadonnées cloud
    "100.64.0.1", // CGNAT
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1", // IPv4 enveloppée
    "::ffff:7f00:1", // même adresse en hexadécimal
    "::ffff:10.0.0.5",
    "64:ff9b::7f00:1", // NAT64 vers 127.0.0.1
    "not-an-ip",
    "",
  ])("refuse %s", (address) => {
    expect(isBlockedIp(address)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "93.184.216.34",
    "172.15.255.255", // juste avant 172.16/12
    "172.32.0.1", // juste après
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
  ])("accepte %s", (address) => {
    expect(isBlockedIp(address)).toBe(false);
  });
});

describe("parseRemoteImageUrl", () => {
  it("accepte une URL HTTPS publique", () => {
    expect(parseRemoteImageUrl("https://cdn.example.com/photos/a.jpg?w=1200").hostname).toBe("cdn.example.com");
  });

  it.each([
    ["http://example.com/a.jpg", /HTTPS/],
    ["ftp://example.com/a.jpg", /HTTPS/],
    ["javascript:alert(1)", /HTTPS|invalide/],
    ["file:///etc/passwd", /HTTPS/],
    ["https://user:secret@example.com/a.jpg", /identifiants/],
    ["https://example.com:8443/a.jpg", /port/],
    ["https://localhost/a.jpg", /non autorisée/],
    ["https://admin.localhost/a.jpg", /non autorisée/],
    ["https://printer.local/a.jpg", /non autorisée/],
    ["https://127.0.0.1/a.jpg", /non autorisée/],
    ["https://[::1]/a.jpg", /non autorisée/],
    ["https://169.254.169.254/latest/meta-data", /non autorisée/],
    ["https://10.0.0.5/a.jpg", /non autorisée/],
    ["not a url", /invalide/],
  ])("refuse %s", (url, message) => {
    expect(() => parseRemoteImageUrl(url)).toThrowError(message);
    expect(() => parseRemoteImageUrl(url)).toThrowError(RemoteFetchError);
  });

  it("refuse une URL démesurée", () => {
    expect(() => parseRemoteImageUrl(`https://example.com/${"a".repeat(3000)}`)).toThrowError(/trop longue/);
  });
});

// ---------------------------------------------------------------------------
// Téléchargement : transport et DNS simulés (aucun accès réseau)
// ---------------------------------------------------------------------------

type Route = { status: number; headers?: Record<string, string>; body?: Buffer[] };

/**
 * Transport HTTPS simulé. Il appelle la fonction `lookup` reçue dans les options, comme le ferait
 * une vraie socket : c'est ce qui permet de tester le refus des adresses privées.
 */
function fakeTransport(routes: Record<string, Route>): typeof https.request {
  return ((url: URL, options: { lookup: (...args: unknown[]) => void }, callback: (res: IncomingMessage) => void) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void };

    req.end = () => {
      options.lookup(url.hostname, { all: true }, (error: Error | null) => {
        if (error) {
          req.emit("error", error);
          return;
        }

        const route = routes[url.toString()];
        if (!route) {
          req.emit("error", new Error("route inconnue"));
          return;
        }

        const response = Readable.from(route.body ?? [Buffer.alloc(0)]) as unknown as IncomingMessage;
        response.statusCode = route.status;
        response.headers = route.headers ?? {};
        callback(response);
      });
    };

    return req;
  }) as unknown as typeof https.request;
}

function fakeDns(table: Record<string, string[]>): typeof dns.lookup {
  return ((hostname: string, _options: unknown, callback: (...args: unknown[]) => void) => {
    const addresses = table[hostname];
    if (!addresses) {
      callback(Object.assign(new Error("not found"), { code: "ENOTFOUND" }));
      return;
    }
    callback(
      null,
      addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })),
    );
  }) as unknown as typeof dns.lookup;
}

const PUBLIC_DNS = { "cdn.example.com": ["93.184.216.34"], "other.example.com": ["8.8.8.8"] };
const acceptImages = (type: string | null) => Boolean(type?.startsWith("image/"));
const options = { maxBytes: 1000, acceptContentType: acceptImages };

function deps(routes: Record<string, Route>, table: Record<string, string[]> = PUBLIC_DNS): RemoteFetchDeps {
  return { request: fakeTransport(routes), lookup: fakeDns(table) };
}

describe("fetchRemoteImage", () => {
  it("télécharge une image publique", async () => {
    const result = await fetchRemoteImage(
      "https://cdn.example.com/a.jpg",
      options,
      deps({
        "https://cdn.example.com/a.jpg": {
          status: 200,
          headers: { "content-type": "image/jpeg", "content-length": "5" },
          body: [Buffer.from("hello")],
        },
      }),
    );

    expect(result.buffer.toString()).toBe("hello");
    expect(result.contentType).toBe("image/jpeg");
    expect(result.finalUrl).toBe("https://cdn.example.com/a.jpg");
  });

  it("refuse un nom d'hôte qui résout vers une adresse privée", async () => {
    await expect(
      fetchRemoteImage(
        "https://cdn.example.com/a.jpg",
        options,
        deps({ "https://cdn.example.com/a.jpg": { status: 200 } }, { "cdn.example.com": ["10.0.0.5"] }),
      ),
    ).rejects.toThrowError(/non autorisée/);
  });

  it("refuse dès qu'UNE des adresses résolues est interne (DNS rebinding)", async () => {
    await expect(
      fetchRemoteImage(
        "https://cdn.example.com/a.jpg",
        options,
        deps(
          { "https://cdn.example.com/a.jpg": { status: 200 } },
          { "cdn.example.com": ["93.184.216.34", "169.254.169.254"] },
        ),
      ),
    ).rejects.toThrowError(/non autorisée/);
  });

  it("suit une redirection vers un hôte public", async () => {
    const result = await fetchRemoteImage(
      "https://cdn.example.com/a.jpg",
      options,
      deps({
        "https://cdn.example.com/a.jpg": { status: 302, headers: { location: "https://other.example.com/b.jpg" } },
        "https://other.example.com/b.jpg": {
          status: 200,
          headers: { "content-type": "image/png" },
          body: [Buffer.from("png")],
        },
      }),
    );

    expect(result.finalUrl).toBe("https://other.example.com/b.jpg");
  });

  it("refuse une redirection vers une adresse interne, même en IP littérale", async () => {
    await expect(
      fetchRemoteImage(
        "https://cdn.example.com/a.jpg",
        options,
        deps({
          "https://cdn.example.com/a.jpg": { status: 302, headers: { location: "https://169.254.169.254/latest" } },
        }),
      ),
    ).rejects.toThrowError(/non autorisée/);
  });

  it("refuse une redirection vers un hôte dont le DNS est interne", async () => {
    await expect(
      fetchRemoteImage(
        "https://cdn.example.com/a.jpg",
        options,
        deps(
          {
            "https://cdn.example.com/a.jpg": { status: 301, headers: { location: "https://evil.example.com/x.jpg" } },
            "https://evil.example.com/x.jpg": { status: 200, headers: { "content-type": "image/jpeg" } },
          },
          { ...PUBLIC_DNS, "evil.example.com": ["192.168.0.10"] },
        ),
      ),
    ).rejects.toThrowError(/non autorisée/);
  });

  it("refuse une redirection vers HTTP", async () => {
    await expect(
      fetchRemoteImage(
        "https://cdn.example.com/a.jpg",
        options,
        deps({
          "https://cdn.example.com/a.jpg": { status: 302, headers: { location: "http://other.example.com/b.jpg" } },
        }),
      ),
    ).rejects.toThrowError(/HTTPS/);
  });

  it("limite le nombre de redirections", async () => {
    const loop = { status: 302, headers: { location: "https://cdn.example.com/a.jpg" } };
    await expect(
      fetchRemoteImage("https://cdn.example.com/a.jpg", options, deps({ "https://cdn.example.com/a.jpg": loop })),
    ).rejects.toThrowError(/redirections/);
  });

  it("refuse une image annoncée trop lourde (Content-Length)", async () => {
    await expect(
      fetchRemoteImage(
        "https://cdn.example.com/a.jpg",
        options,
        deps({
          "https://cdn.example.com/a.jpg": {
            status: 200,
            headers: { "content-type": "image/jpeg", "content-length": "5000" },
            body: [Buffer.from("x")],
          },
        }),
      ),
    ).rejects.toThrowError(/trop volumineuse/);
  });

  it("coupe la lecture d'un flux qui dépasse la limite sans Content-Length", async () => {
    await expect(
      fetchRemoteImage(
        "https://cdn.example.com/a.jpg",
        options,
        deps({
          "https://cdn.example.com/a.jpg": {
            status: 200,
            headers: { "content-type": "image/jpeg" },
            body: [Buffer.alloc(600), Buffer.alloc(600), Buffer.alloc(600)],
          },
        }),
      ),
    ).rejects.toThrowError(/trop volumineuse/);
  });

  it("refuse un type de contenu non accepté et une erreur HTTP", async () => {
    await expect(
      fetchRemoteImage(
        "https://cdn.example.com/a.html",
        options,
        deps({ "https://cdn.example.com/a.html": { status: 200, headers: { "content-type": "text/html" } } }),
      ),
    ).rejects.toThrowError(/non supporté/);

    await expect(
      fetchRemoteImage(
        "https://cdn.example.com/missing.jpg",
        options,
        deps({ "https://cdn.example.com/missing.jpg": { status: 404 } }),
      ),
    ).rejects.toThrowError(/HTTP 404/);
  });

  it("ne révèle pas le détail d'une erreur de transport", async () => {
    await expect(
      fetchRemoteImage("https://cdn.example.com/a.jpg", options, deps({})),
    ).rejects.toThrowError(/^Téléchargement impossible\.$/);
  });

  it("signale un nom d'hôte introuvable", async () => {
    await expect(
      fetchRemoteImage("https://nowhere.example.com/a.jpg", options, deps({ "https://nowhere.example.com/a.jpg": { status: 200 } })),
    ).rejects.toThrowError(/introuvable/);
  });
});
