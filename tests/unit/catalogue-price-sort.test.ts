import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { createCatalogueRepository } from "@/repositories/catalogue.repository";
import type { CatalogueListQuery } from "@/services/catalogue.service";

/**
 * Pagination du tri par prix (repository).
 *
 * Le prix servi au visiteur n'est pas une colonne : il dépend du profil, du type de prix et de la
 * fenêtre de validité. Le classement se fait donc en TypeScript. L'ancienne implémentation
 * rapatriait pour cela TOUT le catalogue avec ses médias et ses jointures de référentiel à chaque
 * affichage — correct à quatre véhicules, intenable à plusieurs centaines.
 *
 * Ces tests décrivent le contrat attendu : classement sur des lignes légères, chargement complet
 * limité à la page affichée, ordre préservé.
 */

type FindManyArgs = { select?: Record<string, unknown>; where?: unknown; skip?: number; take?: number };

/** Faux client Prisma : enregistre les appels et sert des lignes construites à la demande. */
function fakeClient(vehicles: ReadonlyArray<{ id: string; amount: string | null }>) {
  const calls: FindManyArgs[] = [];

  const priceRows = (amount: string | null) =>
    amount === null
      ? []
      : [
          {
            id: `price-${amount}`,
            pricingProfile: "STANDARD",
            priceType: "STANDARD",
            baseAmount: new Prisma.Decimal(amount),
            transportAmount: null,
            currency: "XOF",
            validFrom: null,
            validTo: null,
            isActive: true,
          },
        ];

  /** Ligne complète : uniquement servie pour la page demandée. */
  const fullRow = (id: string, amount: string | null) => ({
    id,
    reference: `REF-${id}`,
    slug: `vehicule-${id}`,
    title: `Véhicule ${id}`,
    description: null,
    brandId: "b1",
    modelId: "m1",
    year: 2020,
    condition: "USED",
    mileage: null,
    bodyTypeId: "bt1",
    fuelTypeId: "ft1",
    transmissionTypeId: "tt1",
    exteriorColorId: null,
    logisticsLocation: "SENEGAL",
    commercialStatus: "AVAILABLE",
    eligibilityStatus: "ELIGIBLE",
    isPublished: true,
    featured: false,
    publishedAt: new Date("2026-01-01"),
    archivedAt: null,
    createdAt: new Date("2026-01-01"),
    brand: { id: "b1", name: "Marque", slug: "marque" },
    model: { id: "m1", name: "Modèle" },
    bodyType: { id: "bt1", name: "Berline" },
    fuelType: { id: "ft1", name: "Essence" },
    transmissionType: { id: "tt1", name: "Automatique" },
    exteriorColor: null,
    media: [],
    prices: priceRows(amount),
  });

  const client = {
    vehicle: {
      async count() {
        return vehicles.length;
      },
      async findMany(args: FindManyArgs) {
        calls.push(args);

        // Requête de classement : uniquement l'identifiant et les prix.
        if (args.select && !("title" in args.select)) {
          return vehicles.map((vehicle) => ({ id: vehicle.id, prices: priceRows(vehicle.amount) }));
        }

        // Requête de page : `IN` ne garantit aucun ordre, on le rend donc volontairement inversé.
        const wanted = (args.where as { id?: { in?: string[] } } | undefined)?.id?.in ?? [];
        return [...wanted]
          .reverse()
          .map((id) => fullRow(id, vehicles.find((vehicle) => vehicle.id === id)?.amount ?? null));
      },
    },
  } as unknown as Prisma.TransactionClient;

  return { client, calls };
}

function query(overrides: Partial<CatalogueListQuery> = {}): CatalogueListQuery {
  return {
    search: null,
    brandId: null,
    modelId: null,
    bodyTypeId: null,
    fuelTypeId: null,
    transmissionTypeId: null,
    condition: null,
    logisticsLocation: null,
    yearMin: null,
    yearMax: null,
    includeSold: false,
    sort: "price_asc",
    page: 1,
    pageSize: 2,
    ...overrides,
  };
}

describe("tri par prix — pagination", () => {
  const catalogue = [
    { id: "v-300", amount: "3000000.00" },
    { id: "v-100", amount: "1000000.00" },
    { id: "v-200", amount: "2000000.00" },
    { id: "v-sans", amount: null },
  ];

  it("classe sur des lignes légères et ne charge entièrement que la page affichée", async () => {
    const { client, calls } = fakeClient(catalogue);

    const result = await createCatalogueRepository(client).list(query());

    expect(result.items.map((item) => item.id)).toEqual(["v-100", "v-200"]);
    expect(result.total).toBe(4);

    // Deux requêtes : le classement, puis la page.
    expect(calls).toHaveLength(2);

    // La requête de classement ne doit ramener ni médias ni jointures de référentiel.
    const ranking = calls[0]?.select ?? {};
    expect(Object.keys(ranking).sort()).toEqual(["id", "prices"]);
    expect(ranking).not.toHaveProperty("media");
    expect(ranking).not.toHaveProperty("brand");

    // La requête de page ne porte que sur les identifiants retenus.
    expect((calls[1]?.where as { id: { in: string[] } }).id.in).toEqual(["v-100", "v-200"]);
  });

  it("restitue l'ordre du classement même si la base renvoie les lignes dans un autre ordre", async () => {
    const { client } = fakeClient(catalogue);

    const result = await createCatalogueRepository(client).list(query({ sort: "price_desc", pageSize: 3 }));

    // Le faux client renvoie volontairement la page à l'envers : l'ordre doit être rétabli.
    expect(result.items.map((item) => item.id)).toEqual(["v-300", "v-200", "v-100"]);
  });

  it("place les véhicules sans prix servi en fin de liste, quel que soit le sens", async () => {
    for (const sort of ["price_asc", "price_desc"] as const) {
      const { client } = fakeClient(catalogue);
      const result = await createCatalogueRepository(client).list(query({ sort, pageSize: 4 }));

      expect(result.items.at(-1)?.id).toBe("v-sans");
    }
  });

  it("sert la deuxième page sans recharger la première", async () => {
    const { client, calls } = fakeClient(catalogue);

    const result = await createCatalogueRepository(client).list(query({ page: 2, pageSize: 2 }));

    expect(result.items.map((item) => item.id)).toEqual(["v-300", "v-sans"]);
    expect((calls[1]?.where as { id: { in: string[] } }).id.in).toEqual(["v-300", "v-sans"]);
  });

  it("n'interroge pas la base une seconde fois quand la page demandée est vide", async () => {
    const { client, calls } = fakeClient(catalogue);

    const result = await createCatalogueRepository(client).list(query({ page: 99 }));

    expect(result.items).toEqual([]);
    expect(result.total).toBe(4);
    expect(calls).toHaveLength(1);
  });
});
