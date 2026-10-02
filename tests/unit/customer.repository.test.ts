import { describe, expect, it } from "vitest";
import {
  createCustomerRepository,
  customerProfileSelect,
  toCustomerProfileRecord,
  toCustomerProfileUpdateData,
  type CustomerProfileClient,
  type CustomerProfileRow,
} from "@/repositories/customer.repository";
import type { CustomerProfileUpdate } from "@/services/profile.service";

const row: CustomerProfileRow = {
  firstName: "Awa",
  lastName: "Diop",
  phone: null,
  whatsapp: null,
  city: "Dakar",
  country: "Sénégal",
  resellerStatus: "PENDING",
};

type ReadArgs = { where: { id: string }; select: unknown };
type UpdateArgs = { where: { id: string }; data: Record<string, unknown>; select: unknown };

/**
 * Dépôt factice : aucune base n'est disponible (décision T10 de docs/decisions.md). Le double
 * enregistre les arguments réellement transmis à Prisma pour vérifier la sélection et la portée.
 */
function fakeClient(rows: Record<string, CustomerProfileRow | null> = { c1: row }) {
  const readCalls: ReadArgs[] = [];
  const updateCalls: UpdateArgs[] = [];

  const client = {
    customerProfile: {
      async findUnique(args: ReadArgs) {
        readCalls.push(args);
        return rows[args.where.id] ?? null;
      },
      async update(args: UpdateArgs) {
        updateCalls.push(args);
        return rows[args.where.id] ?? null;
      },
    },
  } satisfies CustomerProfileClient;

  return { client, readCalls, updateCalls };
}

describe("customerProfileSelect", () => {
  it("selects exactly the seven columns of the personal profile", () => {
    expect(Object.keys(customerProfileSelect).sort()).toEqual([
      "city",
      "country",
      "firstName",
      "lastName",
      "phone",
      "resellerStatus",
      "whatsapp",
    ]);
  });

  it("never selects an internal identifier, a timestamp or a relation", () => {
    for (const forbidden of ["id", "profileId", "profile", "createdAt", "updatedAt", "favorites", "orders"]) {
      expect(customerProfileSelect).not.toHaveProperty(forbidden);
    }
  });
});

describe("toCustomerProfileRecord", () => {
  it("keeps the personal fields and normalises missing values to null", () => {
    expect(toCustomerProfileRecord({ ...row, phone: undefined as unknown as null })).toEqual({
      ...row,
      phone: null,
    });
  });

  it("drops any column that was not explicitly selected", () => {
    const leaked = { ...row, id: "customer-1", profileId: "profile-1", createdAt: new Date() } as CustomerProfileRow;

    expect(Object.keys(toCustomerProfileRecord(leaked)).sort()).toEqual([
      "city",
      "country",
      "firstName",
      "lastName",
      "phone",
      "resellerStatus",
      "whatsapp",
    ]);
  });
});

describe("toCustomerProfileUpdateData", () => {
  it("forwards only the fields a customer may edit", () => {
    const input = {
      firstName: "Awa",
      lastName: "Diop",
      phone: "+221000000000",
      whatsapp: null,
      city: "Dakar",
      country: "Sénégal",
      resellerStatus: "APPROVED",
      status: "ACTIVE",
      userType: "STAFF",
      profileId: "profile-1",
    } as unknown as CustomerProfileUpdate;

    const data = toCustomerProfileUpdateData(input);

    expect(Object.keys(data).sort()).toEqual(["city", "country", "firstName", "lastName", "phone", "whatsapp"]);
    expect(data).not.toHaveProperty("resellerStatus");
    expect(data).not.toHaveProperty("status");
    expect(data).not.toHaveProperty("userType");
  });
});

describe("createCustomerRepository", () => {
  it("reads the caller's profile with the explicit selection and returns the projection", async () => {
    const { client, readCalls } = fakeClient();
    const repository = createCustomerRepository(client);

    await expect(repository.readProfile("c1")).resolves.toEqual(row);

    expect(readCalls).toHaveLength(1);
    expect(readCalls[0].where).toEqual({ id: "c1" });
    expect(readCalls[0].select).toBe(customerProfileSelect);
  });

  it("returns null instead of leaking anything when the profile is missing", async () => {
    const { client } = fakeClient({});
    const repository = createCustomerRepository(client);

    await expect(repository.readProfile("inconnu")).resolves.toBeNull();
  });

  it("never lets the caller reach another customer's row", async () => {
    const { client, readCalls } = fakeClient({ c1: row, c2: { ...row, firstName: "Autre" } });
    const repository = createCustomerRepository(client);

    await repository.readProfile("c2");

    expect(readCalls[0].where).toEqual({ id: "c2" });
    expect(readCalls).toHaveLength(1);
  });

  it("updates by customer id and transmits only the editable personal fields", async () => {
    const { client, updateCalls } = fakeClient();
    const repository = createCustomerRepository(client);
    const data: CustomerProfileUpdate = {
      firstName: "Awa",
      lastName: "Ndiaye",
      phone: null,
      whatsapp: null,
      city: "Thiès",
      country: null,
    };

    await repository.updateProfile("c1", data);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].where).toEqual({ id: "c1" });
    expect(updateCalls[0].select).toBe(customerProfileSelect);
    expect(Object.keys(updateCalls[0].data).sort()).toEqual([
      "city",
      "country",
      "firstName",
      "lastName",
      "phone",
      "whatsapp",
    ]);
    expect(updateCalls[0].data).not.toHaveProperty("resellerStatus");
  });
});
