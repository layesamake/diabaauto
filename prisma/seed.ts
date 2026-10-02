/**
 * Seed idempotent Diaba Auto — rôles ADMIN et COMMERCIAL, 26 permissions officielles et associations.
 *
 * Cadre : `docs/13_Plan_migrations_et_seeds.docx` §« Seeds » (« Seed idempotent des codes de rôles ADMIN et
 * COMMERCIAL, des permissions et de leurs associations minimales ») et `docs/07_Roles_et_permissions.docx`.
 * Répartition provisoire : décision D01 de `docs/decisions.md` (matrice dans `prisma/seed-data.ts`).
 *
 * Garanties :
 * - idempotence stricte : uniquement des `upsert` sur les clés naturelles `Role.code`,
 *   `Permission.code` et la paire `(roleId, permissionId)`, plus une réconciliation qui retire du rôle
 *   les associations absentes de la matrice documentée ;
 * - aucun secret, aucun mot de passe, aucune donnée personnelle : seules des données de référence
 *   (voir `prisma/seed-data.ts`) ;
 * - refus d'écrire sur une base de production sans `ALLOW_PRODUCTION_DATABASE="true"` (E25).
 *
 * Exécution : `npm run seed` ou `npx prisma db seed` (configuré dans `package.json > prisma.seed`).
 */

import { PrismaClient } from "@prisma/client";
import { assertNonProductionDatabase, fail, loadLocalEnv } from "../scripts/database-guard";
import {
  BODY_TYPE_SEEDS,
  FUEL_TYPE_SEEDS,
  PERMISSION_CODES,
  PERMISSION_LABELS,
  PERMISSION_MODULES,
  ROLE_DEFINITIONS,
  ROLE_PERMISSION_MATRIX,
  TRANSMISSION_TYPE_SEEDS,
  type RoleCode,
} from "./seed-data";

export async function seed(prisma: PrismaClient): Promise<void> {
  // 1. Permissions — clé naturelle : code. `name` (libellé français) et `module` sont obligatoires au
  //    schéma : ils sont réalignés à chaque exécution (le code, lui, ne change jamais).
  for (const code of PERMISSION_CODES) {
    await prisma.permission.upsert({
      where: { code },
      update: { name: PERMISSION_LABELS[code], module: PERMISSION_MODULES[code] },
      create: { code, name: PERMISSION_LABELS[code], module: PERMISSION_MODULES[code] },
    });
  }

  // 2. Rôles — clé naturelle : code. Le libellé et la description sont réalignés s'ils ont changé.
  for (const role of ROLE_DEFINITIONS) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description },
      create: { code: role.code, name: role.name, description: role.description },
    });
  }

  // 2 bis. Référentiel automobile explicitement nommé par le doc 13 §« Seeds obligatoires »
  //    (carrosseries, énergies, boîtes de vitesses) — clé naturelle : `code`. Aucune marque, aucun
  //    modèle, aucune couleur : ces valeurs ne sont pas fournies (D14) et ne sont pas inventées.
  for (const bodyType of BODY_TYPE_SEEDS) {
    await prisma.bodyType.upsert({
      where: { code: bodyType.code },
      update: { name: bodyType.name },
      create: { code: bodyType.code, name: bodyType.name },
    });
  }

  for (const fuelType of FUEL_TYPE_SEEDS) {
    await prisma.fuelType.upsert({
      where: { code: fuelType.code },
      update: { name: fuelType.name },
      create: { code: fuelType.code, name: fuelType.name },
    });
  }

  for (const transmission of TRANSMISSION_TYPE_SEEDS) {
    await prisma.transmissionType.upsert({
      where: { code: transmission.code },
      update: { name: transmission.name },
      create: { code: transmission.code, name: transmission.name },
    });
  }

  const roles = await prisma.role.findMany({
    where: { code: { in: ROLE_DEFINITIONS.map((role) => role.code) } },
  });
  const permissions = await prisma.permission.findMany({
    where: { code: { in: [...PERMISSION_CODES] } },
  });

  const roleIdByCode = new Map<string, string>(roles.map((role) => [role.code, role.id]));
  const permissionIdByCode = new Map<string, string>(
    permissions.map((permission) => [permission.code, permission.id]),
  );

  const missingRoles = ROLE_DEFINITIONS.map((role) => role.code).filter(
    (code) => !roleIdByCode.has(code),
  );
  const missingPermissions = [...PERMISSION_CODES].filter(
    (code) => !permissionIdByCode.has(code),
  );
  if (missingRoles.length > 0 || missingPermissions.length > 0) {
    throw new Error(
      `Upsert incomplet : rôles manquants [${missingRoles.join(", ")}], ` +
        `permissions manquantes [${missingPermissions.join(", ")}].`,
    );
  }

  // 3. Associations rôle → permission — clé naturelle : (roleId, permissionId).
  const desiredByRole = new Map<RoleCode, Set<string>>(
    ROLE_DEFINITIONS.map((role) => [role.code, new Set<string>()]),
  );
  for (const row of ROLE_PERMISSION_MATRIX) {
    const roleId = roleIdByCode.get(row.roleCode);
    const permissionId = permissionIdByCode.get(row.permissionCode);
    if (!roleId || !permissionId) {
      throw new Error(
        `Ligne de matrice invalide : ${row.roleCode} → ${row.permissionCode} (référence inconnue).`,
      );
    }
    desiredByRole.get(row.roleCode)?.add(permissionId);

    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      update: {},
      create: { roleId, permissionId },
    });
  }

  // 4. Réconciliation : la matrice D01 fait foi, donc toute association hors matrice est retirée des
  //    rôles amorcés. Sans cette étape, un seed « uniquement additif » ne serait pas convergent et
  //    COMMERCIAL pourrait conserver un droit retiré de la documentation.
  for (const role of ROLE_DEFINITIONS) {
    const roleId = roleIdByCode.get(role.code);
    if (!roleId) continue;
    const desired = [...(desiredByRole.get(role.code) ?? new Set<string>())];

    await prisma.rolePermission.deleteMany({
      where: { roleId, permissionId: { notIn: desired } },
    });
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  assertNonProductionDatabase("le seed Diaba Auto");

  const prisma = new PrismaClient();
  try {
    await seed(prisma);

    const roles = await prisma.role.findMany({
      where: { code: { in: ROLE_DEFINITIONS.map((role) => role.code) } },
      include: { permissions: true },
      orderBy: { code: "asc" },
    });
    const permissionCount = await prisma.permission.count({
      where: { code: { in: [...PERMISSION_CODES] } },
    });
    const bodyTypeCount = await prisma.bodyType.count({
      where: { code: { in: BODY_TYPE_SEEDS.map((row) => row.code) } },
    });
    const fuelTypeCount = await prisma.fuelType.count({
      where: { code: { in: FUEL_TYPE_SEEDS.map((row) => row.code) } },
    });
    const transmissionCount = await prisma.transmissionType.count({
      where: { code: { in: TRANSMISSION_TYPE_SEEDS.map((row) => row.code) } },
    });

    console.info(
      `[seed] Diaba Auto : ${permissionCount}/${PERMISSION_CODES.length} permissions, ` +
        `${roles.length}/${ROLE_DEFINITIONS.length} rôles, ` +
        `${bodyTypeCount} carrosseries, ${fuelTypeCount} énergies, ${transmissionCount} boîtes de vitesses.`,
    );
    for (const role of roles) {
      console.info(`[seed]   ${role.code} (${role.name}) : ${role.permissions.length} permissions`);
    }
    console.info(
      "[seed] Le premier compte administrateur se crée dans Supabase Auth hors dépôt, " +
        "puis se lie avec `npm run staff:grant -- --email <adresse> --role ADMIN`.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Exécution directe uniquement (le module reste importable sans effet de bord).
const invokedDirectly =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("seed.ts") || process.argv[1].endsWith("seed.js"));

if (invokedDirectly) {
  main().catch((error: unknown) => fail("seed", error));
}
