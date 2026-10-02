/**
 * Diaba Auto — entretien des comptes internes (lot 8, reste à faire du lot 7).
 *
 * Deux opérations, toutes deux **réversibles ou sans perte** :
 *
 * 1. **`--fix-residues`** — supprime le `customer_profiles` parasite que le trigger
 *    `on_auth_user_created` crée pour *chaque* nouvel utilisateur Auth, y compris les comptes
 *    internes (constat T49). L'opération est **refusée** si le client résiduel porte la moindre
 *    activité (commande, prospect, demande, favori, recherche enregistrée, réservation) : on ne
 *    détruit jamais de données métier.
 *
 * 2. **`--disable-account <adresse>`** — désactive un compte interne (`profiles.status = DISABLED`),
 *    exactement comme l'écran « Personnel » : réversible, motif obligatoire, et **entrée d'audit
 *    `staff.deactivate`** écrite. Un compte `DISABLED` n'est plus authentifié.
 *
 * Sans option, le script **n'écrit rien** : il affiche l'état et les opérations possibles.
 *
 * Garde-fou : refus d'écrire si `APP_ENV=production` sans `ALLOW_PRODUCTION_DATABASE="true"`
 * (`scripts/database-guard.ts`, décision E25). Aucun secret n'est journalisé.
 *
 * Usage :
 *   npm run staff:fix-residues                                  # diagnostic
 *   npm run staff:fix-residues -- --fix-residues                # suppression des résidus
 *   npm run staff:fix-residues -- --disable-account a@b.c "motif" # désactivation + audit
 */
import { PrismaClient } from "@prisma/client";
import { assertNonProductionDatabase, fail, loadLocalEnv, requireEnv } from "./database-guard";

const CONTEXT = "staff:fix-residues";

type Options = {
  fixResidues: boolean;
  disableAccount: { email: string; reason: string } | null;
};

function parseArgs(argv: string[]): Options {
  const options: Options = { fixResidues: false, disableAccount: null };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--fix-residues") {
      options.fixResidues = true;
      continue;
    }

    if (arg === "--disable-account") {
      const email = argv[index + 1];
      const reason = argv[index + 2];

      if (!email || !reason) {
        throw new Error("--disable-account exige une adresse ET un motif : --disable-account <adresse> \"<motif>\".");
      }

      options.disableAccount = { email, reason };
      index += 2;
    }
  }

  return options;
}

async function main() {
  loadLocalEnv();
  requireEnv("DATABASE_URL");

  const options = parseArgs(process.argv.slice(2));
  const shouldWrite = options.fixResidues || options.disableAccount !== null;

  if (shouldWrite) {
    assertNonProductionDatabase(CONTEXT);
  }

  const prisma = new PrismaClient();

  try {
    const profiles = await prisma.profile.findMany({
      select: {
        id: true,
        authUserId: true,
        userType: true,
        status: true,
        staff: {
          select: {
            firstName: true,
            lastName: true,
            jobTitle: true,
            roles: { select: { role: { select: { code: true } } } },
          },
        },
        customer: { select: { id: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const authUsers = await prisma.$queryRaw<{ id: string; email: string | null }[]>`
      SELECT id, email FROM auth.users
    `;
    const emailById = new Map(authUsers.map((user) => [user.id, user.email ?? "(sans adresse)"]));

    console.log(`\n${profiles.length} profil(s) en base :\n`);

    const residues: { profileId: string; customerId: string; email: string; activity: string[] }[] = [];

    for (const profile of profiles) {
      const email = emailById.get(profile.authUserId) ?? "(compte Auth absent)";
      const roles = profile.staff?.roles.map((entry) => entry.role.code).join(", ") || "aucun rôle";
      const isStaff = profile.userType === "STAFF";

      console.log(
        `- ${email} | ${profile.userType} | ${profile.status} | rôles: ${roles}` +
          (profile.staff
            ? ` | personnel: ${profile.staff.firstName} ${profile.staff.lastName} (${profile.staff.jobTitle ?? "sans fonction"})`
            : ""),
      );

      if (isStaff && profile.customer) {
        const customerId = profile.customer.id;
        const [orders, leads, requests, reservations, favorites, searches] = await Promise.all([
          prisma.order.count({ where: { customerId } }),
          prisma.lead.count({ where: { customerId } }),
          prisma.customVehicleRequest.count({ where: { customerId } }),
          prisma.reservation.count({ where: { customerId } }),
          prisma.favoriteVehicle.count({ where: { customerId } }),
          prisma.savedSearch.count({ where: { customerId } }),
        ]);

        const activity: string[] = [];
        if (orders > 0) activity.push(`${orders} commande(s)`);
        if (leads > 0) activity.push(`${leads} prospect(s)`);
        if (requests > 0) activity.push(`${requests} demande(s)`);
        if (reservations > 0) activity.push(`${reservations} réservation(s)`);
        if (favorites > 0) activity.push(`${favorites} favori(s)`);
        if (searches > 0) activity.push(`${searches} recherche(s)`);

        residues.push({ profileId: profile.id, customerId, email, activity });
      }
    }

    console.log(`\n=== Résidus à réparer : ${residues.length} compte(s) interne(s) portant un customer_profiles ===`);

    for (const residue of residues) {
      if (residue.activity.length === 0) {
        console.log(`- ${residue.email} → AUCUNE activité : suppression possible (customer_profiles ${residue.customerId})`);
      } else {
        console.log(`- ${residue.email} → ACTIVITÉ (${residue.activity.join(", ")}) : SUPPRESSION REFUSÉE`);
      }
    }

    if (options.fixResidues) {
      console.log("\n=== --fix-residues : application ===");
      let removed = 0;
      let refused = 0;

      for (const residue of residues) {
        if (residue.activity.length > 0) {
          refused += 1;
          console.log(`- ${residue.email} : conservé (activité ${residue.activity.join(", ")})`);
          continue;
        }

        await prisma.customerProfile.delete({ where: { id: residue.customerId } });
        removed += 1;
        console.log(`- ${residue.email} : customer_profiles supprimé (${residue.customerId})`);
      }

      console.log(`\n${removed} résidu(s) supprimé(s), ${refused} conservé(s) pour cause d'activité.`);
    }

    if (options.disableAccount) {
      const { email, reason } = options.disableAccount;
      console.log(`\n=== --disable-account ${email} ===`);

      const targetProfile = profiles.find((profile) => emailById.get(profile.authUserId) === email);

      if (!targetProfile) {
        throw new Error(`Aucun profil ne correspond à « ${email} ».`);
      }

      if (targetProfile.status === "DISABLED") {
        console.log(`- Déjà désactivé : aucune écriture.`);
      } else {
        await prisma.$transaction([
          prisma.profile.update({ where: { id: targetProfile.id }, data: { status: "DISABLED" } }),
          prisma.auditLog.create({
            data: {
              actorProfileId: null,
              action: "staff.deactivate",
              entityType: "Profile",
              entityId: targetProfile.id,
              oldValues: { status: targetProfile.status },
              newValues: { status: "DISABLED", reason, source: "scripts/cleanup-staff-residues.ts" },
            },
          }),
        ]);

        console.log(`- Statut passé à DISABLED (réversible) ; audit \`staff.deactivate\` écrit (motif : ${reason}).`);
      }
    }

    if (!shouldWrite) {
      console.log("\nAucune écriture effectuée (mode diagnostic). Options : --fix-residues, --disable-account <adresse> \"<motif>\".");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => fail(CONTEXT, error));
