import { describe, expect, it, vi } from "vitest";
import {
  MAX_MERGE_FAVORITES,
  addFavorite,
  listOwnFavorites,
  mergeFavoritesOnLogin,
  removeFavorite,
  type FavoriteRepository,
} from "@/services/favorite.service";
import type { Actor } from "@/services/identity.service";

const customer: Actor = { kind: "customer", profileId: "p1", customerId: "c1", status: "ACTIVE", resellerStatus: "NOT_APPLICABLE" };
const otherCustomer: Actor = { kind: "customer", profileId: "p2", customerId: "c2", status: "ACTIVE", resellerStatus: "NOT_APPLICABLE" };
const visitor: Actor = { kind: "visitor" };
const suspended: Actor = { kind: "suspended", profileId: "p3", userType: "CUSTOMER" };

const VEHICLE_A = "11111111-1111-4111-8111-111111111111";
const VEHICLE_B = "22222222-2222-4222-8222-222222222222";

function repository(): FavoriteRepository & {
  rows: Record<string, { vehicleId: string; createdAt: Date }[]>;
  addCalls: { customerId: string; vehicleId: string }[];
  removeCalls: { customerId: string; vehicleId: string }[];
  mergeCalls: { customerId: string; vehicleIds: string[] }[];
} {
  const rows: Record<string, { vehicleId: string; createdAt: Date }[]> = {
    c1: [{ vehicleId: VEHICLE_A, createdAt: new Date("2024-01-01T00:00:00Z") }],
  };
  const addCalls: { customerId: string; vehicleId: string }[] = [];
  const removeCalls: { customerId: string; vehicleId: string }[] = [];
  const mergeCalls: { customerId: string; vehicleIds: string[] }[] = [];

  return {
    rows,
    addCalls,
    removeCalls,
    mergeCalls,
    async listByCustomer(customerId) {
      return rows[customerId] ?? [];
    },
    async add(customerId, vehicleId) {
      addCalls.push({ customerId, vehicleId });
    },
    async remove(customerId, vehicleId) {
      removeCalls.push({ customerId, vehicleId });
    },
    async mergeMany(customerId, vehicleIds) {
      mergeCalls.push({ customerId, vehicleIds });
    },
  };
}

describe("favorite access guards", () => {
  it("requires an authenticated customer for every operation", async () => {
    const repo = repository();

    await expect(listOwnFavorites(repo, visitor)).rejects.toThrowError(/authent/i);
    await expect(addFavorite(repo, visitor, VEHICLE_A)).rejects.toThrowError(/authent/i);
    await expect(removeFavorite(repo, visitor, VEHICLE_A)).rejects.toThrowError(/authent/i);
    await expect(mergeFavoritesOnLogin(repo, visitor, [VEHICLE_A])).rejects.toThrowError(/authent/i);
  });

  it("treats a suspended account as unauthenticated for every mutation", async () => {
    const repo = repository();

    await expect(addFavorite(repo, suspended, VEHICLE_A)).rejects.toThrowError(/authent/i);
    await expect(removeFavorite(repo, suspended, VEHICLE_A)).rejects.toThrowError(/authent/i);
    await expect(mergeFavoritesOnLogin(repo, suspended, [VEHICLE_A])).rejects.toThrowError(/authent/i);
    expect(repo.addCalls).toHaveLength(0);
    expect(repo.removeCalls).toHaveLength(0);
    expect(repo.mergeCalls).toHaveLength(0);
  });

  it("never lets a caller target another customer's favorites", async () => {
    const repo = repository();
    const spy = vi.spyOn(repo, "listByCustomer");

    await listOwnFavorites(repo, otherCustomer);

    expect(spy).toHaveBeenCalledWith("c2");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("listOwnFavorites", () => {
  it("projects only vehicleId and addedAt", async () => {
    const repo = repository();

    const favorites = await listOwnFavorites(repo, customer);

    expect(favorites).toEqual([{ vehicleId: VEHICLE_A, addedAt: new Date("2024-01-01T00:00:00Z") }]);
  });
});

describe("addFavorite / removeFavorite", () => {
  it("adds a favorite using the actor's own customerId, never a client-supplied one", async () => {
    const repo = repository();

    await addFavorite(repo, customer, VEHICLE_B);

    expect(repo.addCalls).toEqual([{ customerId: "c1", vehicleId: VEHICLE_B }]);
  });

  it("removes a favorite using the actor's own customerId", async () => {
    const repo = repository();

    await removeFavorite(repo, customer, VEHICLE_A);

    expect(repo.removeCalls).toEqual([{ customerId: "c1", vehicleId: VEHICLE_A }]);
  });

  it("rejects a non-UUID vehicleId instead of forwarding it", async () => {
    const repo = repository();

    await expect(addFavorite(repo, customer, "not-a-uuid")).rejects.toThrowError(/vehicleId/);
    await expect(removeFavorite(repo, customer, "not-a-uuid")).rejects.toThrowError(/vehicleId/);
    expect(repo.addCalls).toHaveLength(0);
    expect(repo.removeCalls).toHaveLength(0);
  });

  it("rejects a missing vehicleId", async () => {
    const repo = repository();

    await expect(addFavorite(repo, customer, undefined)).rejects.toThrowError(/vehicleId/);
  });
});

describe("mergeFavoritesOnLogin", () => {
  it("merges a deduplicated list of local vehicle ids for the actor's customerId", async () => {
    const repo = repository();

    const result = await mergeFavoritesOnLogin(repo, customer, [VEHICLE_A, VEHICLE_B, VEHICLE_A]);

    expect(repo.mergeCalls).toEqual([{ customerId: "c1", vehicleIds: [VEHICLE_A, VEHICLE_B] }]);
    expect(result).toEqual({ merged: 2 });
  });

  it("is a no-op when the local list is empty, without calling the repository", async () => {
    const repo = repository();

    const result = await mergeFavoritesOnLogin(repo, customer, []);

    expect(repo.mergeCalls).toHaveLength(0);
    expect(result).toEqual({ merged: 0 });
  });

  it("rejects a non-UUID entry in the list instead of silently dropping it", async () => {
    const repo = repository();

    await expect(mergeFavoritesOnLogin(repo, customer, [VEHICLE_A, "not-a-uuid"])).rejects.toThrowError(
      /vehicleIds/,
    );
    expect(repo.mergeCalls).toHaveLength(0);
  });

  it("rejects an oversized list instead of forwarding it to the repository", async () => {
    const repo = repository();
    const oversized = Array.from({ length: MAX_MERGE_FAVORITES + 1 }, (_, index) =>
      `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
    );

    await expect(mergeFavoritesOnLogin(repo, customer, oversized)).rejects.toThrowError(/vehicleIds/);
    expect(repo.mergeCalls).toHaveLength(0);
  });
});
