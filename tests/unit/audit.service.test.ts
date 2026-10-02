import { describe, expect, it } from "vitest";
import {
  AUDITED_ACTIONS,
  buildAuditEntry,
  maskPhone,
  sanitizeAuditPayload,
  sensitiveTransitionsRequiringReason,
} from "@/services/audit.service";

describe("audit service", () => {
  it("only accepts the actions that the specifications require to be audited", () => {
    expect(AUDITED_ACTIONS).toContain("reseller.status.change");
    expect(AUDITED_ACTIONS).toContain("vehicle.price.change");
    expect(AUDITED_ACTIONS).toContain("staff.role.assign");
    expect(AUDITED_ACTIONS).toContain("settings.change");

    expect(() =>
      buildAuditEntry({
        actorProfileId: "p1",
        action: "customer.profile.update" as never,
        entityType: "customer_profiles",
        entityId: "c1",
      }),
    ).toThrowError(/unknown audit action/i);
  });

  it("requires an actor, an entity type and a UTC timestamp; keeps the renamed canonical fields", () => {
    const entry = buildAuditEntry({
      actorProfileId: "profile-1",
      action: "vehicle.publish",
      entityType: "vehicles",
      entityId: "vehicle-1",
      oldValues: { commercialStatus: "DRAFT" },
      newValues: { commercialStatus: "AVAILABLE" },
    });

    expect(entry.actorProfileId).toBe("profile-1");
    expect(entry.entityType).toBe("vehicles");
    expect(entry.entityId).toBe("vehicle-1");
    expect(entry.oldValues).toEqual({ commercialStatus: "DRAFT" });
    expect(entry.newValues).toEqual({ commercialStatus: "AVAILABLE" });
    expect(entry.createdAt instanceof Date).toBe(true);
    expect(Number.isNaN(entry.createdAt.getTime())).toBe(false);
  });

  it("requires a reason for the sensitive transitions described by the workflows", () => {
    expect(sensitiveTransitionsRequiringReason).toContain("reseller.status.change");

    expect(() =>
      buildAuditEntry({
        actorProfileId: "admin-1",
        action: "reseller.status.change",
        entityType: "customer_profiles",
        entityId: "customer-1",
        oldValues: { resellerStatus: "PENDING" },
        newValues: { resellerStatus: "APPROVED" },
      }),
    ).toThrowError(/reason/i);

    const entry = buildAuditEntry({
      actorProfileId: "admin-1",
      action: "reseller.status.change",
      entityType: "customer_profiles",
      entityId: "customer-1",
      oldValues: { resellerStatus: "PENDING" },
      newValues: { resellerStatus: "APPROVED" },
      reason: "Dossier complet.",
    });
    expect(entry.reason).toBe("Dossier complet.");
  });

  it("rejects a missing entity type", () => {
    expect(() =>
      buildAuditEntry({ actorProfileId: "p1", action: "vehicle.publish", entityType: "  ", entityId: "vehicle-1" }),
    ).toThrowError(/entity type/i);
  });

  it("no longer requires an entity id: an unnamed entity is accepted and normalised to null", () => {
    const withoutId = buildAuditEntry({
      actorProfileId: "p1",
      action: "vehicle.publish",
      entityType: "vehicles",
    });
    expect(withoutId.entityId).toBeNull();

    const blankId = buildAuditEntry({
      actorProfileId: "p1",
      action: "vehicle.publish",
      entityType: "vehicles",
      entityId: "   ",
    });
    expect(blankId.entityId).toBeNull();
  });

  it("never stores secrets or full phone numbers in the audit payload", () => {
    const payload = sanitizeAuditPayload({
      password: "SuperSecret!123",
      serviceRoleKey: "eyJhbGciOiJI",
      authorization: "Bearer abc",
      phone: "+221771234567",
      contactPhone: "+221771234567",
      nested: { apiKey: "secret-api-key", token: "t0ken", city: "Dakar" },
    }) as Record<string, unknown>;

    expect(payload.password).toBe("[REDACTED]");
    expect(payload.serviceRoleKey).toBe("[REDACTED]");
    expect(payload.authorization).toBe("[REDACTED]");
    expect(payload.phone).toBe("+2217****567");
    expect(payload.contactPhone).toBe("+2217****567");
    expect(payload.nested).toEqual({ apiKey: "[REDACTED]", token: "[REDACTED]", city: "Dakar" });
  });

  it("masks a phone number without losing its country prefix or last digits", () => {
    expect(maskPhone("+221771234567")).toBe("+2217****567");
    expect(maskPhone("77 123 45 67")).toBe("7712****567");
    expect(maskPhone("n/a")).toBe("[REDACTED]");
  });

  it("produces entries that cannot be mutated by the caller", () => {
    const entry = buildAuditEntry({
      actorProfileId: "p1",
      action: "settings.change",
      entityType: "settings",
      entityId: "whatsapp",
    });
    expect(Object.isFrozen(entry)).toBe(true);
  });
});