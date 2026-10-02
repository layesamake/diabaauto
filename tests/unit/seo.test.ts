import { describe, expect, it } from "vitest";
import {
  absoluteUrl,
  buildCatalogueMetadata,
  buildVehicleJsonLd,
  buildVehicleMetadata,
  jsonLdScriptProps,
  type VehicleJsonLdInput,
} from "@/lib/seo";

describe("absoluteUrl", () => {
  it("construit une URL absolue à partir d'un chemin racine", () => {
    expect(absoluteUrl("/voitures", "https://diaba-auto.test")).toBe("https://diaba-auto.test/voitures");
  });

  it("normalise un chemin sans slash initial et une base avec slash final", () => {
    expect(absoluteUrl("voitures", "https://diaba-auto.test/")).toBe("https://diaba-auto.test/voitures");
  });

  it("conserve la racine du site", () => {
    expect(absoluteUrl("/", "https://diaba-auto.test")).toBe("https://diaba-auto.test/");
  });
});

describe("buildVehicleMetadata", () => {
  const input = {
    title: "Toyota Land Cruiser",
    year: 2021,
    description: "Quatre roues motrices, import Sénégal.",
    slug: "toyota-land-cruiser-2021",
    imageUrl: "https://cdn.diaba-auto.test/land-cruiser.jpg",
    standardPriceLabel: "18 500 000 XOF",
    isSold: false,
  } as const;

  it("compose un titre unique avec l'année, le contexte Sénégal et la marque", () => {
    const metadata = buildVehicleMetadata(input);

    expect(metadata.title).toContain(input.title);
    expect(metadata.title).toContain(String(input.year));
    expect(metadata.title).toContain("Sénégal");
    expect(metadata.title).toContain("Diaba Auto");
  });

  it("expose un canonical unique et une description unique", () => {
    const metadata = buildVehicleMetadata(input);

    expect(metadata.alternates?.canonical).toBe(absoluteUrl(`/voitures/${input.slug}`));
    expect(metadata.description).toContain("Quatre roues motrices");
    expect(metadata.description).toContain("18 500 000 XOF");
  });

  it("ajoute l'image principale et le prix public à l'Open Graph", () => {
    const metadata = buildVehicleMetadata(input);
    const openGraph = JSON.stringify(metadata.openGraph);

    expect(openGraph).toContain("https://cdn.diaba-auto.test/land-cruiser.jpg");
    expect(openGraph).toContain("18 500 000 XOF");
  });

  it("indexe la fiche d'un véhicule disponible", () => {
    const metadata = buildVehicleMetadata(input);

    expect(JSON.stringify(metadata.robots)).toContain('"index":true');
  });

  it("marque noindex la fiche d'un véhicule SOLD", () => {
    const metadata = buildVehicleMetadata({ ...input, isSold: true });

    expect(JSON.stringify(metadata.robots)).toContain('"index":false');
    expect(JSON.stringify(metadata.robots)).toContain('"follow":true');
  });

  it("tolère l'absence d'image et de prix", () => {
    const metadata = buildVehicleMetadata({ ...input, imageUrl: null, standardPriceLabel: null });

    expect(metadata.description).not.toContain("Prix public affiché");
    expect(metadata.title).toContain(input.title);
  });
});

describe("buildCatalogueMetadata", () => {
  it("indexe la première page sans suffixe", () => {
    const metadata = buildCatalogueMetadata({ page: 1, total: 30 });

    expect(metadata.title).not.toContain("page");
    expect(metadata.alternates?.canonical).toBe(absoluteUrl("/voitures"));
    expect(JSON.stringify(metadata.robots)).toContain('"index":true');
  });

  it("met les pages > 1 en noindex avec suffixe « — page N »", () => {
    const metadata = buildCatalogueMetadata({ page: 3, total: 30 });

    expect(metadata.title).toContain("— page 3");
    expect(JSON.stringify(metadata.robots)).toContain('"index":false');
    expect(JSON.stringify(metadata.robots)).toContain('"follow":true');
  });

  it("intègre le nom de marque dans le titre", () => {
    const metadata = buildCatalogueMetadata({ page: 1, brandName: "Toyota", total: 12 });

    expect(metadata.title).toContain("Toyota");
  });
});

describe("buildVehicleJsonLd", () => {
  const base: VehicleJsonLdInput = {
    title: "Toyota Land Cruiser 2021",
    brandName: "Toyota",
    modelName: "Land Cruiser",
    year: 2021,
    slug: "toyota-land-cruiser-2021",
    description: "Import Sénégal",
    imageUrls: ["https://cdn.diaba-auto.test/land-cruiser.jpg"],
    priceLabel: null,
    currency: "XOF",
    mileage: null,
    condition: "USED",
  };

  it("produit un schéma Vehicle", () => {
    const data = buildVehicleJsonLd(base);

    expect(data["@type"]).toBe("Vehicle");
    expect(data.name).toBe(base.title);
    expect(data.brand).toEqual({ "@type": "Brand", name: "Toyota" });
  });

  it("n'inclut offers que si un prix public existe", () => {
    expect(buildVehicleJsonLd(base).offers).toBeUndefined();

    const priced = buildVehicleJsonLd({ ...base, priceLabel: "18 500 000 XOF" });
    expect(priced.offers).toMatchObject({ "@type": "Offer", price: "18 500 000 XOF", priceCurrency: "XOF" });
  });

  it("ne contient aucun champ fournisseur ou marge", () => {
    const serialized = JSON.stringify(buildVehicleJsonLd({ ...base, priceLabel: "18 500 000 XOF" }));

    expect(serialized).not.toContain("supplierReference");
    expect(serialized).not.toContain("supplierName");
    expect(serialized).not.toContain("sourceType");
    expect(serialized).not.toContain("sourceUrl");
  });
});

describe("jsonLdScriptProps", () => {
  it("expose le type application/ld+json et échappe « < » en \\u003c", () => {
    const props = jsonLdScriptProps({ name: "</script><img src=x>" });
    const html = props.dangerouslySetInnerHTML.__html;

    expect(props.type).toBe("application/ld+json");
    expect(html).toContain("\\u003c");
    expect(html).not.toContain("<");
  });
});