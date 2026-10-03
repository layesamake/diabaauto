import { describe, expect, it, vi } from "vitest";
import type { OrderLabelsRepository } from "@/repositories/order-labels.repository";
import { resolveOrderLabels } from "@/services/order-labels.service";
import { customerActor, staffActor, visitorActor } from "@/tests/unit/support/actors";

/**
 * Noms et titres de la liste des commandes.
 *
 * `order.view` ne donne PAS accès aux fiches clients : sans `customer.view`, le nom d'un client n'est
 * jamais lu — pas seulement masqué à l'affichage. Même règle pour les véhicules.
 */

function fakeRepository() {
  const customerNames = vi.fn(async (ids: readonly string[]) => new Map(ids.map((id) => [id, `Client ${id}`])));
  const vehicleLabels = vi.fn(
    async (ids: readonly string[]) => new Map(ids.map((id) => [id, { reference: `REF-${id}`, title: `Titre ${id}` }])),
  );
  const repository: OrderLabelsRepository = { customerNames, vehicleLabels };

  return { repository, customerNames, vehicleLabels };
}

const ORDERS = [
  { customerId: "c1", vehicleId: "v1" },
  { customerId: "c1", vehicleId: "v2" },
  { customerId: "c2", vehicleId: "v1" },
];

describe("resolveOrderLabels", () => {
  it("résout clients et véhicules, une seule fois chacun, pour un acteur qui peut tout voir", async () => {
    const { repository, customerNames, vehicleLabels } = fakeRepository();

    const labels = await resolveOrderLabels(staffActor(), ORDERS, repository);

    expect(customerNames).toHaveBeenCalledWith(["c1", "c2"]);
    expect(vehicleLabels).toHaveBeenCalledWith(["v1", "v2"]);
    expect(labels.customers.get("c2")).toBe("Client c2");
    expect(labels.vehicles.get("v2")).toEqual({ reference: "REF-v2", title: "Titre v2" });
  });

  it("ne lit PAS les noms de clients sans customer.view", async () => {
    const { repository, customerNames, vehicleLabels } = fakeRepository();

    const labels = await resolveOrderLabels(staffActor(["order.view", "vehicle.view"]), ORDERS, repository);

    expect(customerNames).not.toHaveBeenCalled();
    expect(labels.customers.size).toBe(0);
    expect(vehicleLabels).toHaveBeenCalled();
  });

  it("ne lit PAS les titres de véhicules sans vehicle.view", async () => {
    const { repository, customerNames, vehicleLabels } = fakeRepository();

    const labels = await resolveOrderLabels(staffActor(["order.view", "customer.view"]), ORDERS, repository);

    expect(vehicleLabels).not.toHaveBeenCalled();
    expect(labels.vehicles.size).toBe(0);
    expect(customerNames).toHaveBeenCalled();
  });

  it("ne lit rien avec la seule permission order.view", async () => {
    const { repository, customerNames, vehicleLabels } = fakeRepository();

    await resolveOrderLabels(staffActor(["order.view"]), ORDERS, repository);

    expect(customerNames).not.toHaveBeenCalled();
    expect(vehicleLabels).not.toHaveBeenCalled();
  });

  it("refuse sans order.view, un client et un visiteur — sans toucher à la base", async () => {
    const { repository, customerNames, vehicleLabels } = fakeRepository();

    await expect(resolveOrderLabels(staffActor(["customer.view"]), ORDERS, repository)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(resolveOrderLabels(customerActor, ORDERS, repository)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(resolveOrderLabels(visitorActor, ORDERS, repository)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(customerNames).not.toHaveBeenCalled();
    expect(vehicleLabels).not.toHaveBeenCalled();
  });
});
