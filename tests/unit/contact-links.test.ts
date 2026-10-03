import { describe, expect, it } from "vitest";
import { formatPostalAddress, mailtoUrl, telUrl, whatsAppChatUrl } from "@/lib/contact-links";

describe("contact-links", () => {
  it("construit le lien WhatsApp depuis un numéro E.164 seulement", () => {
    expect(whatsAppChatUrl("+221782254040")).toBe("https://wa.me/221782254040");
    expect(whatsAppChatUrl("782254040")).toBeNull();
    expect(whatsAppChatUrl("+0123456789")).toBeNull();
    expect(whatsAppChatUrl("")).toBeNull();
  });

  it("nettoie le téléphone pour tel: et refuse l'inexploitable", () => {
    expect(telUrl("+221 33 825-00.00")).toBe("tel:+221338250000");
    expect(telUrl("(221) 33 82 50 00")).toBe("tel:22133825000");
    expect(telUrl("12 34")).toBeNull();
    expect(telUrl("appelez-nous")).toBeNull();
  });

  it("n'émet un mailto: que pour une adresse valide", () => {
    expect(mailtoUrl(" contact@diaba.example ")).toBe("mailto:contact@diaba.example");
    expect(mailtoUrl("pas-un-email")).toBeNull();
    expect(mailtoUrl("a@b.c\nBcc: x@y.z")).toBeNull();
  });

  it("assemble l'adresse avec les seules parties renseignées", () => {
    expect(
      formatPostalAddress({ contactAddress: "Rue 10", contactCity: "Dakar", contactCountry: "Sénégal" }),
    ).toBe("Rue 10, Dakar, Sénégal");
    expect(formatPostalAddress({ contactAddress: null, contactCity: " Dakar ", contactCountry: null })).toBe("Dakar");
    expect(formatPostalAddress({ contactAddress: null, contactCity: "  ", contactCountry: null })).toBeNull();
  });
});
