/**
 * Amorçage d'un jeu de DONNÉES DE DÉMONSTRATION pour le catalogue public Diaba Auto.
 *
 * Objet : rendre le catalogue public visible en développement et en démonstration, sans inventer un
 * catalogue commercial. Le seed de référence (`prisma/seed.ts`) ne contient ni marque ni véhicule,
 * conformément au corpus (doc 13, D14/D25/D32) : le catalogue réel est saisi par l'exploitant.
 *
 * Garanties :
 * - idempotence : `upsert` sur les clés naturelles `Brand.slug`, `(VehicleModel.brandId, slug)` et
 *   `Vehicle.reference` ; le prix Standard est réconcilié (une seule ligne active par véhicule) ;
 * - identification : toute référence commence par `DEMO-` et tout titre porte la mention
 *   « données fictives » (`prisma/seed-demo-data.ts`) ;
 * - refus d'écrire sur une base de production sans `ALLOW_PRODUCTION_DATABASE="true"` (E25) ;
 * - aucun secret, aucune donnée personnelle.
 *
 * Exécution : `npm run seed:demo` (après `npm run prisma:migrate:deploy` et `npm run seed`).
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PrismaClient, type Prisma } from "@prisma/client";
import { assertNonProductionDatabase, fail, loadLocalEnv, requireEnv } from "../scripts/database-guard";
import {
  DEMO_ASSETS_DIR,
  DEMO_BRANDS,
  DEMO_REFERENCE_PREFIX,
  DEMO_TITLE_MARKER,
  DEMO_VEHICLE_IMAGES,
  DEMO_VEHICLES,
} from "./seed-demo-data";

/** Vérifie les conventions d'identification avant toute écriture. */
export function assertDemoDataIsIdentified(): void {
  for (const vehicle of DEMO_VEHICLES) {
    if (!vehicle.reference.startsWith(DEMO_REFERENCE_PREFIX)) {
      throw new Error(
        `Donnée de démonstration non identifiée : la référence « ${vehicle.reference} » doit commencer par « ${DEMO_REFERENCE_PREFIX} ».`,
      );
    }
    if (!vehicle.title.includes(DEMO_TITLE_MARKER)) {
      throw new Error(
        `Donnée de démonstration non identifiée : le titre de « ${vehicle.reference} » doit contenir « ${DEMO_TITLE_MARKER} ».`,
      );
    }
  }

  for (const brand of DEMO_BRANDS) {
    if (!brand.slug.startsWith("demo-")) {
      throw new Error(`Marque de démonstration non identifiée : le slug « ${brand.slug} » doit commencer par « demo- ».`);
    }
  }
}

async function resolveReferentialIds(prisma: PrismaClient) {
  const [bodyTypes, fuelTypes, transmissions] = await Promise.all([
    prisma.bodyType.findMany({ select: { id: true, code: true } }),
    prisma.fuelType.findMany({ select: { id: true, code: true } }),
    prisma.transmissionType.findMany({ select: { id: true, code: true } }),
  ]);

  const byCode = (rows: readonly { id: string; code: string }[]) =>
    new Map(rows.map((row) => [row.code, row.id]));

  return {
    bodyTypeIdByCode: byCode(bodyTypes),
    fuelTypeIdByCode: byCode(fuelTypes),
    transmissionTypeIdByCode: byCode(transmissions),
  };
}

/** Bucket privé des images de véhicule (identique à l'application). */
const DEMO_IMAGE_BUCKET = process.env.SUPABASE_BUCKET_VEHICLE_IMAGES?.trim() || "vehicle-images";

/**
 * Client Storage pour le seed, ou `null` si la configuration manque. Le seed des véhicules reste
 * possible sans Storage : seules les images sont alors ignorées, avec un message explicite.
 */
function resolveDemoStorage(): { client: SupabaseClient; bucket: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    client: createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    bucket: DEMO_IMAGE_BUCKET,
  };
}

/**
 * Attache les images de démonstration à un véhicule — UNIQUEMENT s'il n'en a aucune, pour ne jamais
 * écraser des images saisies à la main depuis le back-office. Idempotent : un deuxième passage ne
 * recrée rien (le véhicule a désormais des images). Retourne le nombre d'images ajoutées.
 */
async function attachDemoImages(
  prisma: PrismaClient,
  storage: { client: SupabaseClient; bucket: string },
  vehicleId: string,
  reference: string,
): Promise<number> {
  const manifest = DEMO_VEHICLE_IMAGES.find((entry) => entry.reference === reference);
  if (!manifest) {
    return 0;
  }

  const existing = await prisma.vehicleMedia.count({ where: { vehicleId } });
  if (existing > 0) {
    return 0;
  }

  let added = 0;
  for (const image of manifest.images) {
    const storagePath = `demo/${image.file}`;
    const fileUrl = new URL(`./${DEMO_ASSETS_DIR}/${image.file}`, import.meta.url);
    const buffer = await readFile(fileURLToPath(fileUrl));

    const { error } = await storage.client.storage
      .from(storage.bucket)
      .upload(storagePath, buffer, { contentType: "image/webp", upsert: true });
    if (error) {
      throw new Error(`Téléversement de l'image de démonstration « ${storagePath} » échoué : ${error.message}`);
    }

    await prisma.vehicleMedia.create({
      data: {
        vehicleId,
        mediaType: "IMAGE",
        storagePath,
        category: "gallery",
        displayOrder: image.order,
        isPrimary: image.isPrimary,
        visibility: "PUBLIC",
      },
    });
    added += 1;
  }

  return added;
}

export async function seedDemo(prisma: PrismaClient): Promise<void> {
  assertDemoDataIsIdentified();

  const { bodyTypeIdByCode, fuelTypeIdByCode, transmissionTypeIdByCode } = await resolveReferentialIds(prisma);
  const storage = resolveDemoStorage();
  let imagesAdded = 0;

  // 1. Marques et modèles de démonstration.
  for (const brand of DEMO_BRANDS) {
    const brandRow = await prisma.brand.upsert({
      where: { slug: brand.slug },
      update: { name: brand.name, countryOfOrigin: brand.countryOfOrigin, isActive: true },
      create: { name: brand.name, slug: brand.slug, countryOfOrigin: brand.countryOfOrigin, isActive: true },
    });

    for (const model of brand.models) {
      await prisma.vehicleModel.upsert({
        where: { brandId_slug: { brandId: brandRow.id, slug: model.slug } },
        update: { name: model.name, isActive: true },
        create: { brandId: brandRow.id, name: model.name, slug: model.slug, isActive: true },
      });
    }
  }

  // 2. Véhicules publiés, avec leur prix Standard actif.
  for (const vehicle of DEMO_VEHICLES) {
    const brandRow = await prisma.brand.findUniqueOrThrow({ where: { slug: vehicle.brandSlug } });
    const modelRow = await prisma.vehicleModel.findUniqueOrThrow({
      where: { brandId_slug: { brandId: brandRow.id, slug: vehicle.modelSlug } },
    });

    const bodyTypeId = bodyTypeIdByCode.get(vehicle.bodyTypeCode);
    const fuelTypeId = fuelTypeIdByCode.get(vehicle.fuelTypeCode);
    const transmissionTypeId = transmissionTypeIdByCode.get(vehicle.transmissionTypeCode);

    if (!bodyTypeId || !fuelTypeId || !transmissionTypeId) {
      throw new Error(
        `Référentiels manquants pour ${vehicle.reference} : exécuter d'abord « npm run seed » (carrosserie, énergie, boîte de vitesses).`,
      );
    }

    const data = {
      slug: vehicle.slug,
      title: vehicle.title,
      brandId: brandRow.id,
      modelId: modelRow.id,
      condition: vehicle.condition,
      year: vehicle.year,
      mileage: vehicle.mileage,
      fuelTypeId,
      transmissionTypeId,
      bodyTypeId,
      doors: vehicle.doors,
      seats: vehicle.seats,
      logisticsLocation: vehicle.logisticsLocation,
      commercialStatus: "AVAILABLE" as const,
      eligibilityStatus: "NOT_CHECKED" as const,
      isPublished: true,
      publishedAt: new Date(),
      archivedAt: null,
    } satisfies Omit<Prisma.VehicleUncheckedCreateInput, "reference">;

    const vehicleRow = await prisma.vehicle.upsert({
      where: { reference: vehicle.reference },
      update: data,
      create: { reference: vehicle.reference, ...data },
    });

    const price = {
      pricingProfile: "STANDARD" as const,
      priceType: "REGULAR" as const,
      baseAmount: vehicle.standardPriceXof,
      currency: "XOF",
      isActive: true,
    };

    const existingPrice = await prisma.vehiclePrice.findFirst({
      where: { vehicleId: vehicleRow.id, pricingProfile: "STANDARD", priceType: "REGULAR" },
      select: { id: true },
    });

    if (existingPrice) {
      await prisma.vehiclePrice.update({ where: { id: existingPrice.id }, data: price, });
    } else {
      await prisma.vehiclePrice.create({ data: { vehicleId: vehicleRow.id, ...price } });
    }

    // 3. Images de démonstration (si le Storage est configuré, et seulement pour un véhicule sans image).
    if (storage) {
      imagesAdded += await attachDemoImages(prisma, storage, vehicleRow.id, vehicle.reference);
    }
  }

  if (!storage) {
    console.warn(
      "[seed:demo] Storage non configuré (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents) : " +
        "véhicules créés SANS image. Renseignez ces variables puis relancez pour téléverser les images.",
    );
  } else {
    console.log(`[seed:demo] ${imagesAdded} image(s) de démonstration téléversée(s) et attachée(s).`);
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  requireEnv("DATABASE_URL");
  assertNonProductionDatabase("l'amorçage de démonstration Diaba Auto");

  const prisma = new PrismaClient();
  try {
    await seedDemo(prisma);
    const published = await prisma.vehicle.count({
      where: { isPublished: true, archivedAt: null },
    });
    console.log(
      `[seed:demo] Diaba Auto : ${DEMO_BRANDS.length} marques fictives, ` +
        `${DEMO_VEHICLES.length} véhicules de démonstration, ${published} véhicule(s) publié(s) en base.`,
    );
    console.log("[seed:demo] Ces données sont fictives et identifiées comme telles ; elles ne doivent pas être publiées en production commerciale.");
  } finally {
    await prisma.$disconnect();
  }
}

// Exécution directe uniquement (le module reste importable sans effet de bord : les tests importent
// `assertDemoDataIsIdentified` sans déclencher l'amorçage).
const invokedDirectly =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("seed-demo.ts") || process.argv[1].endsWith("seed-demo.js"));

if (invokedDirectly) {
  main().catch((error: unknown) => {
    fail("l'amorçage de démonstration Diaba Auto", error);
  });
}
