import type { Metadata } from "next";

/**
 * SEO technique des pages publiques (lot 3, enfant C).
 *
 * Règles imposées :
 * - titres et descriptions uniques, `canonical` unique, Open Graph avec image principale et prix
 *   public STANDARD ;
 * - pagination : pages > 1 en `noindex` (title suffixé « — page N ») ;
 * - fiche d'un véhicule `SOLD` : accessible mais `noindex` ;
 * - JSON-LD `Vehicle` sans aucun champ fournisseur/marge ; `offers` seulement si un prix public existe ;
 *   `<` échappé en `\u003c` dans le JSON sérialisé.
 *
 * Aucune donnée sensible (`supplierReference`, `supplierName`, `sourceType`, `sourceUrl`) n'apparaît
 * dans une métadonnée ou un JSON-LD : ces fonctions ne reçoivent que des champs publics.
 */

const SITE_NAME = "Diaba Auto";
const DEFAULT_APP_URL = "http://localhost:3000";

/** Base absolue du site : argument explicite, sinon `NEXT_PUBLIC_APP_URL`, sinon développement local. */
function resolveBaseUrl(baseUrl?: string): string {
  const candidate = baseUrl?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || DEFAULT_APP_URL;
  return candidate.replace(/\/+$/, "");
}

/** Construit une URL absolue à partir du chemin public et de la base du site. */
export function absoluteUrl(path: string, baseUrl?: string): string {
  const base = resolveBaseUrl(baseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  try {
    return new URL(normalizedPath, `${base}/`).toString();
  } catch {
    return `${base}${normalizedPath}`;
  }
}

export type VehicleMetadataInput = {
  title: string;
  year: number;
  description: string | null;
  slug: string;
  imageUrl: string | null;
  standardPriceLabel: string | null;
  isSold: boolean;
};

/** Métadonnées d'une fiche véhicule. `title` = nom + année + contexte Sénégal + marque site. */
export function buildVehicleMetadata(input: VehicleMetadataInput): Metadata {
  const title = `${input.title} ${input.year} — Sénégal | ${SITE_NAME}`;
  const canonical = absoluteUrl(`/voitures/${input.slug}`);

  const baseDescription =
    input.description?.trim() ||
    `${input.title} ${input.year} disponible chez ${SITE_NAME} — import Sénégal.`;
  const priceLabel = input.standardPriceLabel?.trim();
  const description = priceLabel
    ? `${baseDescription} Prix public affiché : ${priceLabel}.`
    : baseDescription;

  return {
    title,
    description,
    alternates: { canonical },
    robots: {
      index: !input.isSold,
      follow: true,
    },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      images: input.imageUrl ? [{ url: input.imageUrl, alt: `${input.title} ${input.year}` }] : undefined,
    },
  };
}

export type CatalogueMetadataInput = {
  page: number;
  brandName?: string | null;
  total: number;
};

/** Métadonnées du catalogue : page 1 indexée, pages > 1 en `noindex` avec suffixe « — page N ». */
export function buildCatalogueMetadata(input: CatalogueMetadataInput): Metadata {
  const isFirstPage = input.page <= 1;
  const brandName = input.brandName?.trim();
  const baseTitle = brandName
    ? `${brandName} — voitures à importer au Sénégal | ${SITE_NAME}`
    : `Voitures à importer au Sénégal | ${SITE_NAME}`;
  const title = isFirstPage ? baseTitle : `${baseTitle} — page ${input.page}`;
  const canonical = absoluteUrl(isFirstPage ? "/voitures" : `/voitures?page=${input.page}`);

  return {
    title,
    alternates: { canonical },
    robots: {
      index: isFirstPage,
      follow: true,
    },
    openGraph: {
      type: "website",
      title,
      url: canonical,
      siteName: SITE_NAME,
    },
  };
}

export type VehicleJsonLdInput = {
  title: string;
  brandName: string;
  modelName: string;
  year: number;
  slug: string;
  description: string | null;
  imageUrls: string[];
  priceLabel: string | null;
  currency: string | null;
  mileage: number | null;
  condition: "NEW" | "USED";
};

/**
 * JSON-LD `Vehicle` (sous-type de `Product`). `offers` n'est présent que si un prix public existe.
 * Aucun champ fournisseur/marge n'est jamais ajouté.
 */
export function buildVehicleJsonLd(input: VehicleJsonLdInput): Record<string, unknown> {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    name: input.title,
    brand: { "@type": "Brand", name: input.brandName },
    model: input.modelName,
    vehicleModelDate: String(input.year),
    sku: input.slug,
    itemCondition:
      input.condition === "NEW"
        ? "https://schema.org/NewCondition"
        : "https://schema.org/UsedCondition",
  };

  const description = input.description?.trim();
  if (description) {
    data.description = description;
  }

  if (input.imageUrls.length > 0) {
    data.image = input.imageUrls;
  }

  if (input.mileage !== null) {
    data.mileageFromOdometer = {
      "@type": "QuantitativeValue",
      value: input.mileage,
      unitCode: "KMT",
    };
  }

  const priceLabel = input.priceLabel?.trim();
  if (priceLabel) {
    data.offers = {
      "@type": "Offer",
      price: priceLabel,
      ...(input.currency ? { priceCurrency: input.currency } : {}),
      availability: "https://schema.org/InStock",
      url: absoluteUrl(`/voitures/${input.slug}`),
    };
  }

  return data;
}

/**
 * Propriétés du `<script type="application/ld+json">`. Le JSON sérialisé échappe `<` en `\u003c`
 * pour empêcher toute fermeture prématurée de balise (`</script>`).
 */
export function jsonLdScriptProps(data: Record<string, unknown>): {
  type: "application/ld+json";
  dangerouslySetInnerHTML: { __html: string };
} {
  return {
    type: "application/ld+json",
    dangerouslySetInnerHTML: { __html: JSON.stringify(data).replace(/</g, "\\u003c") },
  };
}