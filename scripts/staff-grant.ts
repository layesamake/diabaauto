#!/usr/bin/env node
/**
 * `npm run staff:grant -- --email <adresse> --role ADMIN|COMMERCIAL`
 *
 * Amorçage du premier compte STAFF/ADMIN (doc 13 §« Seeds » : « Compte administrateur initial créé via
 * Supabase Auth hors dépôt ; lier son auth_user_id au profil STAFF puis attribuer ADMIN. Aucun mot de
 * passe de seed. »). Procédure documentée par la décision D04 de `docs/decisions.md`.
 *
 * Contrat :
 * - refuse d'écrire si `APP_ENV=production` et `ALLOW_PRODUCTION_DATABASE != "true"` ;
 * - exige `SUPABASE_SERVICE_ROLE_KEY` et `DATABASE_URL` (et l'URL du projet Supabase pour l'API admin) ;
 * - ne demande, ne génère et n'écrit AUCUN mot de passe : l'utilisateur Auth doit préexister côté
 *   Supabase (invitation, création manuelle ou parcours d'inscription) ;
 * - idempotent : `Profile` est attaché à l'`auth_user_id` existant (upsert sur sa clé naturelle), le
 *   `StaffProfile` est créé ou conservé (upsert sur `profileId`) et le rôle est attribué par upsert
 *   sur la table de jointure `staff_roles` (`(staff_id, role_id)`) — il n'existe plus de
 *   `staff_profiles.role_id` ni de champ `active` ;
 * - l'activité du membre reste portée par `Profile.status` (`ACTIVE` = authentifié) : le script ne
 *   force jamais le statut et signale un compte inactif.
 *
 * Exemple : `npm run staff:grant -- --email admin@example.com --role ADMIN`
 */

import { PrismaClient } from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertNonProductionDatabase, fail, loadLocalEnv, requireEnv } from "./database-guard";
import { ROLE_DEFINITIONS, type RoleCode } from "../prisma/seed-data";

const USAGE =
  "Usage : npm run staff:grant -- --email <adresse> --role ADMIN|COMMERCIAL\n" +
  "  --email       adresse de l'utilisateur existant dans Supabase Auth (jamais de mot de passe)\n" +
  "  --role        rôle à attribuer : ADMIN ou COMMERCIAL\n" +
  "  --first-name  (optionnel) prénom du membre du personnel, requis par le schéma\n" +
  "  --last-name   (optionnel) nom du membre du personnel, requis par le schéma";

const VALID_ROLES: readonly RoleCode[] = ROLE_DEFINITIONS.map((role) => role.code);

interface CliOptions {
  email: string;
  role: RoleCode;
  firstName: string;
  lastName: string;
}

/**
 * `StaffProfile.firstName` / `lastName` sont obligatoires au schéma : si l'opérateur ne les fournit
 * pas, ils sont dérivés de la partie locale de l'adresse (jamais d'un mot de passe, jamais d'un
 * secret). Une valeur dérivée peut être corrigée plus tard ; le script ne réécrit jamais un membre
 * existant.
 */
function staffNameFromEmail(email: string): { firstName: string; lastName: string } {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter((part) => part.length > 0);
  const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

  if (parts.length === 0) {
    return { firstName: local || "Personnel", lastName: "Diaba Auto" };
  }
  if (parts.length === 1) {
    return { firstName: capitalize(parts[0]), lastName: capitalize(parts[0]) };
  }

  return { firstName: capitalize(parts[0]), lastName: capitalize(parts.slice(1).join(" ")) };
}

function parseArgs(argv: string[]): CliOptions {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    if (!token.startsWith("--")) {
      throw new Error(`Argument inattendu « ${token} ».\n${USAGE}`);
    }
    if (token === "--help" || token === "-h") {
      console.info(USAGE);
      process.exit(0);
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Valeur manquante pour ${token}.\n${USAGE}`);
    }
    flags.set(token.slice(2), value.trim());
    index += 1;
  }

  const email = flags.get("email");
  const role = flags.get("role")?.toUpperCase();
  if (!email || !role) {
    throw new Error(`--email et --role sont obligatoires.\n${USAGE}`);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Adresse e-mail invalide : « ${email} ».`);
  }
  if (!VALID_ROLES.includes(role as RoleCode)) {
    throw new Error(`Rôle invalide : « ${role} ». Valeurs acceptées : ${VALID_ROLES.join(", ")}.`);
  }

  const derived = staffNameFromEmail(email);
  const firstName = flags.get("first-name") ?? derived.firstName;
  const lastName = flags.get("last-name") ?? derived.lastName;
  if (firstName.length === 0 || lastName.length === 0) {
    throw new Error(`--first-name et --last-name doivent être non vides.\n${USAGE}`);
  }

  return { email, role: role as RoleCode, firstName, lastName };
}

/** Recherche un utilisateur Auth par e-mail via l'API admin Supabase (pagination complète). */
async function findAuthUserIdByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<string | null> {
  const target = email.trim().toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 1000; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Échec de l'API admin Supabase (listUsers, page ${page}) : ${error.message}`);
    }

    const match = data.users.find((user) => user.email?.trim().toLowerCase() === target);
    if (match) return match.id;

    if (data.users.length < perPage) return null;
  }

  throw new Error("Pagination Supabase dépassée (plus de 1 000 000 d'utilisateurs) : arrêt par sûreté.");
}

async function main(): Promise<void> {
  loadLocalEnv();
  const options = parseArgs(process.argv.slice(2));

  assertNonProductionDatabase("staff:grant");
  requireEnv(
    "DATABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_URL ? "NEXT_PUBLIC_SUPABASE_URL" : "SUPABASE_URL",
  );

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").replace(
    /\/+$/,
    "",
  );
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const authUserId = await findAuthUserIdByEmail(supabase, options.email);
  if (!authUserId) {
    throw new Error(
      `Aucun utilisateur Supabase Auth pour « ${options.email} ». ` +
        "Créer ou inviter le compte dans Supabase Auth d'abord (aucun mot de passe n'est géré par ce script).",
    );
  }

  const prisma = new PrismaClient();
  try {
    const role = await prisma.role.findUnique({ where: { code: options.role } });
    if (!role) {
      throw new Error(
        `Rôle « ${options.role} » absent de la base. Exécuter le seed au préalable : npm run seed.`,
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingProfile = await tx.profile.findUnique({ where: { authUserId } });

      const profile = await tx.profile.upsert({
        where: { authUserId },
        // Le profil est rattaché à l'utilisateur Auth existant. Le statut du compte n'est pas forcé :
        // une réactivation/ suspension reste un acte distinct (doc 07, audit des statuts).
        update: { userType: "STAFF" },
        create: { authUserId, userType: "STAFF" },
      });

      const existingStaff = await tx.staffProfile.findUnique({
        where: { profileId: profile.id },
      });

      const staff = await tx.staffProfile.upsert({
        where: { profileId: profile.id },
        // Les noms ne sont jamais écrasés : une seconde exécution ne réécrit pas l'identité du membre.
        update: {},
        create: {
          profileId: profile.id,
          firstName: options.firstName,
          lastName: options.lastName,
        },
      });

      // Attribution du rôle via la table de jointure `staff_roles` (N:N), clé naturelle (staff_id, role_id).
      const existingLink = await tx.staffRole.findUnique({
        where: { staffId_roleId: { staffId: staff.id, roleId: role.id } },
      });
      await tx.staffRole.upsert({
        where: { staffId_roleId: { staffId: staff.id, roleId: role.id } },
        update: {},
        create: { staffId: staff.id, roleId: role.id },
      });

      return {
        profile,
        staff,
        profileCreated: existingProfile === null,
        staffCreated: existingStaff === null,
        roleLinked: existingLink === null,
        previousUserType: existingProfile?.userType ?? null,
      };
    });

    // Journal sans donnée sensible : ni secret, ni mot de passe, ni jeton.
    console.info(`[staff:grant] Compte : ${options.email}`);
    console.info(`[staff:grant] Profile ${result.profile.id} : ${result.profileCreated ? "créé" : "existant"}${
      result.profileCreated ? "" : ` (userType ${result.previousUserType} → STAFF)`
    }`);
    console.info(
      `[staff:grant] StaffProfile ${result.staff.id} : ${result.staffCreated ? "créé" : "existant"} ` +
        `(${result.staff.firstName} ${result.staff.lastName}).`,
    );
    console.info(
      `[staff:grant] Rôle ${role.code} (${role.name}) : ${result.roleLinked ? "attribué" : "déjà attribué"}.`,
    );
    console.info(`[staff:grant] Statut du compte : ${result.profile.status}`);
    if (result.profile.status !== "ACTIVE") {
      console.warn(
        `[staff:grant] Attention : Profile.status = ${result.profile.status}. ` +
          "Le membre du personnel n'est PAS traité comme authentifié tant que le statut n'est pas ACTIVE.",
      );
    }
    console.info("[staff:grant] Aucun mot de passe n'a été créé, demandé ni écrit.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => fail("staff:grant", error));
