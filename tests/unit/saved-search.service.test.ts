import { describe, expect, it } from "vitest";
import {
  configureSavedSearchDependencies,
  createSavedSearch,
  listOwnSavedSearches,
  MAX_SAVED_SEARCH_NAME_LENGTH,
  parseCreateSavedSearchInput,
  removeSavedSearch,
  resetSavedSearchDependencies,
  sanitizeSavedSearchCriteria,
  SavedSearchValidationError,
  type SavedSearchRecord,
  type SavedSearchRepository,
} from "@/services/saved-search.service";
import { customerActor, visitorActor } from "@/tests/unit/support/actors";
import type { Actor } from "@/services/identity.service";

const otherCustomer: Actor = {
  kind: "customer",
  profileId: "profile-other",
  customerId: "customer-2",
  status: "ACTIVE",
  resellerStatus: "NOT_APPLICABLE",
};

const baseRow: SavedSearchRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Berlines Dakar",
  criteria: { brandId: "22222222-2222-4222-8222-222222222222", condition: "USED" },
  notificationsEnabled: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

/** Double de repository — aucune base n'est disponible (doubles, cf. tests/unit/profile.service.test.ts). */
function fakeRepository(rows: SavedSearchRecord[] = [baseRow]) {
  const owned = new Map<string, Set<string>>([["customer-1", new Set(rows.map((row) => row.id))]]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const createCalls: { customerId: string; data: unknown }[] = [];
  const listCalls: string[] = [];
  const removeCalls: { customerId: string; id: string }[] = [];

  const repository: SavedSearchRepository = {
    async listByCustomer(customerId) {
      listCalls.push(customerId);
      const ids = owned.get(customerId) ?? new Set<string>();
      return [...ids].map((id) => byId.get(id)!).filter(Boolean);
    },
    async create(customerId, data) {
      createCalls.push({ customerId, data });
      const row: SavedSearchRecord = {
        id: "new-id",
        name: data.name,
        criteria: data.criteria,
        notificationsEnabled: data.notificationsEnabled,
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      };
      byId.set(row.id, row);
      const set = owned.get(customerId) ?? new Set<string>();
      set.add(row.id);
      owned.set(customerId, set);
      return row;
    },
    async remove(customerId, id) {
      removeCalls.push({ customerId, id });
      const set = owned.get(customerId);
      if (!set || !set.has(id)) {
        return false;
      }
      set.delete(id);
      byId.delete(id);
      return true;
    },
  };

  return { repository, createCalls, listCalls, removeCalls };
}

describe("sanitizeSavedSearchCriteria", () => {
  it("drops page and pageSize from an otherwise valid filter set", () => {
    const sanitized = sanitizeSavedSearchCriteria({
      brandId: "22222222-2222-4222-8222-222222222222",
      condition: "NEW",
      page: 3,
      pageSize: 24,
    });

    expect(sanitized).not.toHaveProperty("page");
    expect(sanitized).not.toHaveProperty("pageSize");
    expect(sanitized).toMatchObject({ brandId: "22222222-2222-4222-8222-222222222222", condition: "NEW" });
  });

  it("rejects an unknown key instead of silently ignoring it (zod strict, reused from catalogue.service)", () => {
    const invalid = { marque: "byd" } as never;
    expect(() => sanitizeSavedSearchCriteria(invalid)).toThrowError(/catalogue invalides/i);
  });

  it("still applies the catalogue service's own defaults (availability, sort) before stripping pagination", () => {
    const sanitized = sanitizeSavedSearchCriteria({});
    expect(sanitized).toEqual({ availability: "available", sort: "recent" });
  });
});

describe("parseCreateSavedSearchInput", () => {
  it("accepts a well-formed name, flag and filter set", () => {
    const result = parseCreateSavedSearchInput({
      name: "  Mes SUV  ",
      notificationsEnabled: true,
      filters: { condition: "USED", page: 2 },
    });

    expect(result).toEqual({
      name: "Mes SUV",
      notificationsEnabled: true,
      criteria: { condition: "USED", availability: "available", sort: "recent" },
    });
  });

  it(`rejects a name longer than ${MAX_SAVED_SEARCH_NAME_LENGTH} characters`, () => {
    expect(() =>
      parseCreateSavedSearchInput({
        name: "a".repeat(MAX_SAVED_SEARCH_NAME_LENGTH + 1),
        notificationsEnabled: false,
        filters: {},
      }),
    ).toThrowError(SavedSearchValidationError);
  });

  it("rejects an empty name", () => {
    expect(() =>
      parseCreateSavedSearchInput({ name: "   ", notificationsEnabled: false, filters: {} }),
    ).toThrowError(/name/);
  });

  it("rejects a non-boolean notificationsEnabled", () => {
    expect(() =>
      parseCreateSavedSearchInput({ name: "A", notificationsEnabled: "yes", filters: {} }),
    ).toThrowError(/notificationsEnabled/);
  });

  it("rejects an unknown top-level field (no silent fallback)", () => {
    expect(() =>
      parseCreateSavedSearchInput({
        name: "A",
        notificationsEnabled: false,
        filters: {},
        customerId: "customer-2",
      } as never),
    ).toThrowError(/customerId/);
  });

  it("rejects an invalid filter payload via the filters field marker", () => {
    expect(() =>
      parseCreateSavedSearchInput({ name: "A", notificationsEnabled: false, filters: { page: -1 } }),
    ).toThrowError(/filters/);
  });
});

describe("saved search access control", () => {
  it("requires an authenticated customer for every operation", async () => {
    const { repository } = fakeRepository();
    await expect(listOwnSavedSearches(visitorActor)).rejects.toThrowError(/authent/i);
    await expect(
      createSavedSearch(visitorActor, { name: "A", notificationsEnabled: false, filters: {} }),
    ).rejects.toThrowError(/authent/i);
    await expect(removeSavedSearch(visitorActor, "id")).rejects.toThrowError(/authent/i);
    void repository;
  });

  it("only ever lists the caller's own saved searches", async () => {
    const { repository, listCalls } = fakeRepository();
    configureSavedSearchDependencies({ repository });

    try {
      await listOwnSavedSearches(customerActor);
      expect(listCalls).toEqual(["customer-1"]);

      const forOther = await listOwnSavedSearches(otherCustomer);
      expect(listCalls).toEqual(["customer-1", "customer-2"]);
      expect(forOther).toEqual([]);
    } finally {
      resetSavedSearchDependencies();
    }
  });

  it("creates a saved search owned by the resolved actor, never a caller-supplied customer", async () => {
    const { repository, createCalls } = fakeRepository();
    configureSavedSearchDependencies({ repository });

    try {
      const created = await createSavedSearch(customerActor, {
        name: "Nouvelle recherche",
        notificationsEnabled: true,
        filters: { condition: "NEW" },
      });

      expect(createCalls).toEqual([
        {
          customerId: "customer-1",
          data: {
            name: "Nouvelle recherche",
            notificationsEnabled: true,
            criteria: { condition: "NEW", availability: "available", sort: "recent" },
          },
        },
      ]);
      expect(created).not.toHaveProperty("customerId");
    } finally {
      resetSavedSearchDependencies();
    }
  });

  it("returns NOT_FOUND — never FORBIDDEN — when removing another customer's saved search", async () => {
    const { repository, removeCalls } = fakeRepository();
    configureSavedSearchDependencies({ repository });

    try {
      await expect(removeSavedSearch(otherCustomer, baseRow.id)).rejects.toThrowError(/introuvable/i);
      expect(removeCalls).toEqual([{ customerId: "customer-2", id: baseRow.id }]);
    } finally {
      resetSavedSearchDependencies();
    }
  });

  it("removes the caller's own saved search", async () => {
    const { repository, removeCalls } = fakeRepository();
    configureSavedSearchDependencies({ repository });

    try {
      await expect(removeSavedSearch(customerActor, baseRow.id)).resolves.toBeUndefined();
      expect(removeCalls).toEqual([{ customerId: "customer-1", id: baseRow.id }]);
    } finally {
      resetSavedSearchDependencies();
    }
  });

  it("rejects a non-UUID id before reaching the repository", async () => {
    const { repository, removeCalls } = fakeRepository();
    configureSavedSearchDependencies({ repository });

    try {
      await expect(removeSavedSearch(customerActor, "pas-un-uuid")).rejects.toThrowError(/invalide/i);
      expect(removeCalls).toEqual([]);
    } finally {
      resetSavedSearchDependencies();
    }
  });
});
