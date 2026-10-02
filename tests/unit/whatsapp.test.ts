import { describe, expect, it } from "vitest";
import { DEFAULT_WHATSAPP_NUMBER, readContactConfig } from "@/lib/config/contact";
import {
  buildVehicleWhatsAppMessage,
  buildVehicleWhatsAppUrl,
  normalizeWhatsAppNumber,
} from "@/lib/whatsapp";

const vehicle = {
  title: "Toyota Land Cruiser 2021",
  reference: "DIA-000123",
  url: "https://diaba-auto.test/voitures/toyota-land-cruiser-2021",
} as const;

describe("readContactConfig", () => {
  it("applique le numéro WhatsApp par défaut (BR-120) quand la variable est absente", () => {
    const config = readContactConfig({});

    expect(config.whatsappNumber).toBe(DEFAULT_WHATSAPP_NUMBER);
    expect(config.whatsappNumber).toBe("+221782254040");
    expect(config.contactPhone).toBeNull();
    expect(config.contactCountry).toBeNull();
  });

  it("lit les variables du contact et retire les espaces du numéro WhatsApp", () => {
    const config = readContactConfig({
      NEXT_PUBLIC_WHATSAPP_NUMBER: "+221 78 225 40 40",
      NEXT_PUBLIC_CONTACT_PHONE: "  +221 33 000 00 00  ",
      NEXT_PUBLIC_CONTACT_COUNTRY: "",
    });

    expect(config.whatsappNumber).toBe("+221782254040");
    expect(config.contactPhone).toBe("+221 33 000 00 00");
    expect(config.contactCountry).toBeNull();
  });
});

describe("normalizeWhatsAppNumber", () => {
  it("accepte un numéro déjà en E.164", () => {
    expect(normalizeWhatsAppNumber("+221782254040")).toBe("+221782254040");
  });

  it("retire les espaces et séparateurs de mise en forme", () => {
    expect(normalizeWhatsAppNumber("+221 78 225 40 40")).toBe("+221782254040");
    expect(normalizeWhatsAppNumber("+221 (78) 225-40.40")).toBe("+221782254040");
  });

  it("convertit le préfixe international 00 en +", () => {
    expect(normalizeWhatsAppNumber("00221782254040")).toBe("+221782254040");
  });

  it("accepte des chiffres nus en les préfixant de +", () => {
    expect(normalizeWhatsAppNumber("221782254040")).toBe("+221782254040");
  });

  it("retourne null pour un numéro inexploitable", () => {
    expect(normalizeWhatsAppNumber("")).toBeNull();
    expect(normalizeWhatsAppNumber("   ")).toBeNull();
    expect(normalizeWhatsAppNumber("+")).toBeNull();
    expect(normalizeWhatsAppNumber("abc")).toBeNull();
    expect(normalizeWhatsAppNumber("+221abc040")).toBeNull();
    expect(normalizeWhatsAppNumber("+22178")).toBeNull();
    expect(normalizeWhatsAppNumber("+221782254040123456")).toBeNull();
    expect(normalizeWhatsAppNumber("+0221782254040")).toBeNull();
  });
});

describe("buildVehicleWhatsAppMessage", () => {
  it("contient au minimum le nom, la référence et le lien du véhicule", () => {
    const message = buildVehicleWhatsAppMessage(vehicle);

    expect(message).toContain(vehicle.title);
    expect(message).toContain(vehicle.reference);
    expect(message).toContain(vehicle.url);
  });

  it("ajoute le prix public quand il est fourni, sans jamais parler de devis", () => {
    const message = buildVehicleWhatsAppMessage({ ...vehicle, priceLabel: "18 500 000 XOF" });

    expect(message).toContain("18 500 000 XOF");
    expect(message.toLowerCase()).not.toContain("devis");
  });

  it("omet la ligne de prix quand elle est absente", () => {
    const message = buildVehicleWhatsAppMessage({ ...vehicle, priceLabel: null });

    expect(message).not.toContain("Prix public affiché");
    expect(message).toContain(vehicle.reference);
  });
});

describe("buildVehicleWhatsAppUrl", () => {
  it("construit un lien wa.me sans + et avec le message encodé", () => {
    const url = buildVehicleWhatsAppUrl({ ...vehicle, whatsappNumber: "+221 78 225 40 40" });

    expect(url).not.toBeNull();
    expect(url?.startsWith("https://wa.me/221782254040?text=")).toBe(true);

    const encoded = url?.slice("https://wa.me/221782254040?text=".length) ?? "";
    const decoded = decodeURIComponent(encoded);

    expect(decoded).toContain(vehicle.title);
    expect(decoded).toContain(vehicle.reference);
    expect(decoded).toContain(vehicle.url);
  });

  it("retourne null pour un numéro inexploitable", () => {
    expect(buildVehicleWhatsAppUrl({ ...vehicle, whatsappNumber: "abc" })).toBeNull();
    expect(buildVehicleWhatsAppUrl({ ...vehicle, whatsappNumber: "" })).toBeNull();
  });
});