import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `vitest.config.ts` utilise l'environnement `node` (pas de `jsdom` dans ce dépôt) : ce test fournit
 * donc un `window.localStorage` minimal lui-même, pour rester fidèle au contrat (« fonctions pures
 * testables ») sans ajouter de dépendance de test. Le module est importé dynamiquement APRÈS la pose
 * du global, car `local-store.ts` lit `typeof window` au moment de l'appel (pas à l'import).
 */

const VEHICLE_A = "11111111-1111-4111-8111-111111111111";
const VEHICLE_B = "22222222-2222-4222-8222-222222222222";

function fakeLocalStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  } as Storage;
}

async function loadModule() {
  return import("@/lib/favorites/local-store");
}

describe("local favorites store", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", { localStorage: fakeLocalStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts empty", async () => {
    const { readLocalFavorites } = await loadModule();
    expect(readLocalFavorites()).toEqual([]);
  });

  it("adds a favorite and persists it under the versioned key", async () => {
    const { addLocalFavorite, readLocalFavorites, FAVORITES_STORAGE_KEY } = await loadModule();

    addLocalFavorite(VEHICLE_A);

    expect(readLocalFavorites()).toEqual([VEHICLE_A]);
    expect(JSON.parse(window.localStorage.getItem(FAVORITES_STORAGE_KEY) ?? "[]")).toEqual([VEHICLE_A]);
  });

  it("never duplicates an id already present (idempotent add)", async () => {
    const { addLocalFavorite, readLocalFavorites } = await loadModule();

    addLocalFavorite(VEHICLE_A);
    addLocalFavorite(VEHICLE_A);

    expect(readLocalFavorites()).toEqual([VEHICLE_A]);
  });

  it("removes a favorite (idempotent: removing twice is not an error)", async () => {
    const { addLocalFavorite, removeLocalFavorite, readLocalFavorites } = await loadModule();

    addLocalFavorite(VEHICLE_A);
    addLocalFavorite(VEHICLE_B);
    removeLocalFavorite(VEHICLE_A);
    removeLocalFavorite(VEHICLE_A);

    expect(readLocalFavorites()).toEqual([VEHICLE_B]);
  });

  it("reports membership via isLocalFavorite", async () => {
    const { addLocalFavorite, isLocalFavorite } = await loadModule();

    addLocalFavorite(VEHICLE_A);

    expect(isLocalFavorite(VEHICLE_A)).toBe(true);
    expect(isLocalFavorite(VEHICLE_B)).toBe(false);
  });

  it("clears all local favorites (used on logout, server favorites untouched)", async () => {
    const { addLocalFavorite, clearLocalFavorites, readLocalFavorites, FAVORITES_STORAGE_KEY } =
      await loadModule();

    addLocalFavorite(VEHICLE_A);
    addLocalFavorite(VEHICLE_B);
    clearLocalFavorites();

    expect(readLocalFavorites()).toEqual([]);
    expect(window.localStorage.getItem(FAVORITES_STORAGE_KEY)).toBeNull();
  });

  it("ignores non-UUID entries instead of throwing", async () => {
    const { readLocalFavorites, FAVORITES_STORAGE_KEY } = await loadModule();

    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(["not-a-uuid", VEHICLE_A, 42]));

    expect(readLocalFavorites()).toEqual([VEHICLE_A]);
  });

  it("recovers from corrupted JSON content instead of throwing", async () => {
    const { readLocalFavorites, FAVORITES_STORAGE_KEY } = await loadModule();

    window.localStorage.setItem(FAVORITES_STORAGE_KEY, "{not-json");

    expect(readLocalFavorites()).toEqual([]);
  });

  it("recovers from a non-array JSON content instead of throwing", async () => {
    const { readLocalFavorites, FAVORITES_STORAGE_KEY } = await loadModule();

    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify({ oops: true }));

    expect(readLocalFavorites()).toEqual([]);
  });

  it("never throws when localStorage is absent (SSR / private browsing)", async () => {
    vi.stubGlobal("window", undefined);
    const { readLocalFavorites, isLocalFavorite, addLocalFavorite, removeLocalFavorite, clearLocalFavorites } =
      await loadModule();

    expect(() => readLocalFavorites()).not.toThrow();
    expect(() => isLocalFavorite(VEHICLE_A)).not.toThrow();
    expect(() => addLocalFavorite(VEHICLE_A)).not.toThrow();
    expect(() => removeLocalFavorite(VEHICLE_A)).not.toThrow();
    expect(() => clearLocalFavorites()).not.toThrow();

    expect(readLocalFavorites()).toEqual([]);
    expect(isLocalFavorite(VEHICLE_A)).toBe(false);
  });

  it("never throws when localStorage access itself throws (private browsing)", async () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("localStorage is unavailable");
      },
    });
    const { readLocalFavorites, addLocalFavorite } = await loadModule();

    expect(() => readLocalFavorites()).not.toThrow();
    expect(() => addLocalFavorite(VEHICLE_A)).not.toThrow();
    expect(readLocalFavorites()).toEqual([]);
  });

  it("never throws when localStorage.setItem fails (quota exceeded)", async () => {
    const storage = fakeLocalStorage();
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.stubGlobal("window", { localStorage: storage });
    const { addLocalFavorite } = await loadModule();

    expect(() => addLocalFavorite(VEHICLE_A)).not.toThrow();
  });
});
