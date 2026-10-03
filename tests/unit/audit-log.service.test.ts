import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditLogRepository, AuditLogRow } from "@/repositories/audit-log.repository";
import {
  configureAuditLogRepository,
  listAuditLog,
  resetAuditLogRepository,
} from "@/services/audit-log.service";
import { customerActor, staffActor, visitorActor } from "@/tests/unit/support/actors";

/**
 * Journal d'activité — service.
 *
 * Il est réservé à `audit.view`, relit les valeurs à travers l'assainissement, ne transmet que les
 * colonnes prévues et borne ses filtres.
 */

const NOW = new Date("2026-10-30T12:00:00Z");

function row(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: "e1",
    createdAt: new Date("2026-10-29T09:00:00Z"),
    action: "vehicle.publish",
    entityType: "Vehicle",
    entityId: "v1",
    oldValues: { isPublished: false },
    newValues: { isPublished: true },
    actorName: "Awa Diop",
    ...overrides,
  };
}

function installRepository(rows: AuditLogRow[] = [row()], counts: Record<string, number> = {}) {
  const list = vi.fn<AuditLogRepository["list"]>(async () => ({ rows, total: rows.length }));
  const countByAction = vi.fn<AuditLogRepository["countByAction"]>(async () => counts);
  const repository: AuditLogRepository = { list, countByAction };
  configureAuditLogRepository(repository);

  return { list, countByAction };
}

afterEach(() => resetAuditLogRepository());

describe("listAuditLog — droits", () => {
  it("refuse sans audit.view, sans rien lire", async () => {
    const { list, countByAction } = installRepository();

    await expect(listAuditLog(staffActor(["vehicle.view", "order.view"]), {}, NOW)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(list).not.toHaveBeenCalled();
    expect(countByAction).not.toHaveBeenCalled();
  });

  it("refuse un client et un visiteur", async () => {
    const { list } = installRepository();

    await expect(listAuditLog(customerActor, {}, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listAuditLog(visitorActor, {}, NOW)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(list).not.toHaveBeenCalled();
  });

  it("accepte audit.view", async () => {
    installRepository();

    const page = await listAuditLog(staffActor(["audit.view"]), {}, NOW);

    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]).toMatchObject({ actionLabel: "Véhicule publié", category: "vehicules", actorName: "Awa Diop" });
  });
});

describe("listAuditLog — assainissement à la lecture", () => {
  it("ne laisse jamais ressortir un secret, même écrit en clair avant un durcissement", async () => {
    installRepository([
      row({ newValues: { status: "ACTIVE", password: "motdepasse-en-clair", apiKey: "sk-123", note: "ok" } }),
    ]);

    const [entry] = (await listAuditLog(staffActor(), {}, NOW)).entries;
    const rendered = JSON.stringify(entry);

    expect(rendered).not.toContain("motdepasse-en-clair");
    expect(rendered).not.toContain("sk-123");
    expect(entry?.changes.find((change) => change.field === "password")?.after).toBe("[REDACTED]");
  });

  it("masque un numéro de téléphone complet", async () => {
    installRepository([row({ oldValues: null, newValues: { phone: "+221770001122" } })]);

    const [entry] = (await listAuditLog(staffActor(), {}, NOW)).entries;

    expect(JSON.stringify(entry)).not.toContain("+221770001122");
  });

  it("extrait le motif et le garde hors des changements", async () => {
    installRepository([
      row({
        action: "order.status.change",
        entityType: "Order",
        oldValues: { status: "CONFIRMED" },
        newValues: { status: "CANCELLED", reason: "Client injoignable" },
      }),
    ]);

    const [entry] = (await listAuditLog(staffActor(), {}, NOW)).entries;

    expect(entry?.reason).toBe("Client injoignable");
    expect(entry?.changes).toEqual([{ field: "status", before: "CONFIRMED", after: "CANCELLED" }]);
  });

  it("n'expose ni adresse IP ni user-agent : la vue ne porte que les champs prévus", async () => {
    installRepository([row()]);

    const [entry] = (await listAuditLog(staffActor(), {}, NOW)).entries;

    expect(Object.keys(entry ?? {}).sort()).toEqual(
      [
        "action", "actionLabel", "actorName", "category", "changes", "createdAt",
        "entityId", "entityType", "id", "reason",
      ].sort(),
    );
  });

  it("garde une action inconnue lisible comme telle, sans la cacher", async () => {
    installRepository([row({ action: "vehicle.explode" })]);

    const [entry] = (await listAuditLog(staffActor(), {}, NOW)).entries;

    expect(entry).toMatchObject({ actionLabel: "Action inconnue", category: null });
  });
});

describe("listAuditLog — filtres et effectifs", () => {
  it("transmet les actions de la famille choisie, la période et la page", async () => {
    const { list, countByAction } = installRepository();

    await listAuditLog(staffActor(), { category: "commandes", period: "7j", page: 3 }, NOW);

    expect(list).toHaveBeenCalledWith({
      actions: ["order.status.change"],
      since: new Date("2026-10-23T12:00:00.000Z"),
      page: 3,
      pageSize: 50,
    });
    expect(countByAction).toHaveBeenCalledWith(new Date("2026-10-23T12:00:00.000Z"));
  });

  it("ne restreint aucune action pour « Tout », sur 30 jours par défaut", async () => {
    const { list } = installRepository();

    await listAuditLog(staffActor(), {}, NOW);

    expect(list).toHaveBeenCalledWith({
      actions: undefined,
      since: new Date("2026-09-30T12:00:00.000Z"),
      page: 1,
      pageSize: 50,
    });
  });

  it("compte chaque famille, et « Tout » compte même une action qu'aucune famille ne connaît", async () => {
    installRepository([], {
      "vehicle.publish": 3,
      "vehicle.sell": 1,
      "order.status.change": 2,
      "staff.activate": 4,
      "vehicle.explode": 5,
    });

    const { categoryCounts } = await listAuditLog(staffActor(), { category: "commandes" }, NOW);

    // Les effectifs ne dépendent PAS de la famille choisie : on peut passer de l'une à l'autre en les voyant.
    expect(categoryCounts).toEqual({
      tout: 15,
      personnel: 4,
      revendeurs: 0,
      vehicules: 4,
      commandes: 2,
      parametres: 0,
    });
  });

  it("refuse des filtres hors bornes ou inconnus", async () => {
    installRepository();

    for (const filters of [{ page: 0 }, { page: 10_001 }, { page: 1.5 }, { category: "x" }, { period: "1an" }, { extra: 1 }]) {
      await expect(listAuditLog(staffActor(), filters as never, NOW), JSON.stringify(filters)).rejects.toMatchObject({
        code: "VALIDATION",
      });
    }
  });
});
