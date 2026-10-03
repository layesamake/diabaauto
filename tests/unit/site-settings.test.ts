import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WHATSAPP_NUMBER, resolveContact, type StoredContact } from "@/lib/config/contact";
import { parseSiteSettings, readSiteSettingsForm } from "@/lib/site-settings/site-settings-schema";
import type { SiteSettingsRepository } from "@/repositories/site-settings.repository";
import {
  configureSiteSettingsRepository,
  getSiteSettings,
  resetSiteSettingsRepository,
  updateSiteSettings,
} from "@/services/site-settings.service";
import type { AuditLogEntry } from "@/services/audit.service";
import { customerActor, staffActor, visitorActor } from "@/tests/unit/support/actors";

const EMPTY: StoredContact = {
  whatsappNumber: null,
  contactPhone: null,
  contactEmail: null,
  contactAddress: null,
  contactCity: null,
  contactCountry: null,
};

const VALID = {
  whatsappNumber: "+221 78 225 40 40",
  contactPhone: "",
  contactEmail: "contact@diaba.example",
  contactAddress: "",
  contactCity: "Dakar",
  contactCountry: "Sénégal",
};

describe("parseSiteSettings", () => {
  it("normalise le numéro et transforme les champs vides en null", () => {
    const result = parseSiteSettings(VALID);

    expect(result).toEqual({
      ok: true,
      value: {
        whatsappNumber: "+221782254040",
        contactPhone: null,
        contactEmail: "contact@diaba.example",
        contactAddress: null,
        contactCity: "Dakar",
        contactCountry: "Sénégal",
      },
    });
  });

  it.each(["0782254040", "+0123456789", "+22178", "abc", "+221 78 22 54 04 0000000000"])(
    "refuse le numéro WhatsApp %s",
    (whatsappNumber) => {
      expect(parseSiteSettings({ ...VALID, whatsappNumber })).toEqual({ ok: false, fields: ["whatsappNumber"] });
    },
  );

  it("refuse un e-mail mal formé et nomme le champ sans jamais citer la valeur", () => {
    const result = parseSiteSettings({ ...VALID, contactEmail: "pas-un-email" });

    expect(result).toEqual({ ok: false, fields: ["contactEmail"] });
    expect(JSON.stringify(result)).not.toContain("pas-un-email");
  });

  it("refuse toute clé inconnue", () => {
    expect(parseSiteSettings({ ...VALID, id: 2 }).ok).toBe(false);
  });

  it("n'accepte que le vide pour effacer : un champ vide = null", () => {
    const result = parseSiteSettings({ ...VALID, whatsappNumber: "" });

    expect(result.ok && result.value.whatsappNumber).toBeNull();
  });
});

describe("readSiteSettingsForm", () => {
  it("ne lit que les champs connus", () => {
    const form = new FormData();
    form.set("whatsappNumber", "+221782254040");
    form.set("id", "2");
    form.set("userType", "ADMIN");

    const raw = readSiteSettingsForm(form);

    expect(Object.keys(raw).sort()).toEqual(
      ["contactAddress", "contactCity", "contactCountry", "contactEmail", "contactPhone", "whatsappNumber"],
    );
    expect(parseSiteSettings(raw).ok).toBe(true);
  });
});

describe("resolveContact", () => {
  it("la valeur saisie prime sur l'environnement", () => {
    const result = resolveContact(
      { ...EMPTY, whatsappNumber: "+221700000000", contactPhone: "+221 33 000 00 00" },
      { NEXT_PUBLIC_WHATSAPP_NUMBER: "+10000000000", NEXT_PUBLIC_CONTACT_PHONE: "+19999999999" },
    );

    expect(result.whatsappNumber).toBe("+221700000000");
    expect(result.contactPhone).toBe("+221 33 000 00 00");
  });

  it("retombe sur l'environnement, puis sur la valeur documentée pour WhatsApp", () => {
    expect(resolveContact(EMPTY, { NEXT_PUBLIC_WHATSAPP_NUMBER: "+221711111111" }).whatsappNumber).toBe(
      "+221711111111",
    );
    expect(resolveContact(EMPTY, {}).whatsappNumber).toBe(DEFAULT_WHATSAPP_NUMBER);
  });

  it("fonctionne sans réglages (table absente ou illisible)", () => {
    const result = resolveContact(null, { NEXT_PUBLIC_CONTACT_COUNTRY: "Sénégal" });

    expect(result.whatsappNumber).toBe(DEFAULT_WHATSAPP_NUMBER);
    expect(result.contactCountry).toBe("Sénégal");
    expect(result.contactEmail).toBeNull();
  });
});

describe("services/site-settings.service", () => {
  afterEach(() => resetSiteSettingsRepository());

  function fakeRepository(stored: StoredContact) {
    const audits: (AuditLogEntry | null)[] = [];
    const save = vi.fn<SiteSettingsRepository["save"]>(async (next, buildAudit) => {
      audits.push(buildAudit(stored, next));
      return next;
    });
    const repository: SiteSettingsRepository = { read: async () => stored, save };
    configureSiteSettingsRepository(repository);
    return { save, audits };
  }

  it("refuse le visiteur, le client et le personnel sans settings.manage", async () => {
    const { save } = fakeRepository(EMPTY);

    for (const actor of [visitorActor, customerActor, staffActor(["vehicle.view"])]) {
      await expect(getSiteSettings(actor)).rejects.toThrow();
      await expect(updateSiteSettings(actor, VALID)).rejects.toThrow();
    }
    expect(save).not.toHaveBeenCalled();
  });

  it("refuse une valeur invalide sans rien écrire", async () => {
    const { save } = fakeRepository(EMPTY);

    await expect(
      updateSiteSettings(staffActor(["settings.manage"]), { ...VALID, whatsappNumber: "123" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(save).not.toHaveBeenCalled();
  });

  it("enregistre et journalise seulement les champs modifiés", async () => {
    const { audits } = fakeRepository({ ...EMPTY, contactCity: "Dakar" });

    await updateSiteSettings(staffActor(["settings.manage"]), VALID);

    const entry = audits[0];
    expect(entry?.action).toBe("settings.change");
    expect(entry?.entityType).toBe("site_settings");
    expect(Object.keys(entry?.newValues as object).sort()).toEqual(
      ["contactCountry", "contactEmail", "whatsappNumber"],
    );
    // Le numéro complet n'apparaît pas dans le journal.
    expect(JSON.stringify(entry)).not.toContain("+221782254040");
  });

  it("n'écrit aucune entrée d'audit quand rien ne change", async () => {
    const { audits } = fakeRepository({
      whatsappNumber: "+221782254040",
      contactPhone: null,
      contactEmail: "contact@diaba.example",
      contactAddress: null,
      contactCity: "Dakar",
      contactCountry: "Sénégal",
    });

    await updateSiteSettings(staffActor(["settings.manage"]), VALID);

    expect(audits).toEqual([null]);
  });
});
