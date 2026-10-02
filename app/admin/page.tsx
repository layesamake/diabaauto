import type { Metadata } from "next";
import Link from "next/link";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { createAdminMetadata } from "@/app/admin/guard";
import { getCurrentActor } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/errors";
import { requireStaff } from "@/services/access.service";
import type { PermissionCode } from "@/services/permissions.service";

/**
 * Back-office Diaba Auto — accueil du lot L2.
 *
 * L'accès exige `requireStaff(actor, "vehicle.view")` : session vérifiée, statut de compte actif,
 * puis permission. La permission d'entrée est la plus faible du portail opérationnel : elle est
 * portée par ADMIN et par le COMMERCIAL de la matrice provisoire (D01), afin qu'un commercial
 * habilité puisse atteindre le back-office, sans lui ouvrir les écrans d'administration.
 * Un visiteur, un client ou un membre du personnel sans cette permission reçoit un refus neutre,
 * sans aucune donnée.
 *
 * Chaque écran livré n'est proposé que si l'acteur porte la permission correspondante ; le lien
 * n'est qu'une aide, la page cible appliquant sa propre garde.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Back-office Diaba Auto",
  "Accès réservé au personnel habilité.",
);

export default async function AdminPage() {
  const actor = await getCurrentActor();
  const authenticated = actor.kind !== "visitor";

  let permissions: PermissionCode[] = [];
  let denial: { code: string; message: string } | null = null;

  try {
    const staff = requireStaff(actor, "vehicle.view");
    permissions = staff.permissions;
  } catch (error) {
    denial = toErrorResponse(error).error;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <AdminHeader
        permissions={permissions}
        title="Back-office Diaba Auto"
        subtitle="Accès réservé au personnel habilité."
        logout={authenticated ? <LogoutButton action={logoutAction} /> : undefined}
      />

      <div className="mt-8 grid gap-6">
        {denial ? <AdminAccessDenied code={denial.code} message={denial.message} /> : null}
        {permissions.length > 0 ? <AdminScreens permissions={permissions} /> : null}
      </div>
    </main>
  );
}

/** Écrans livrés par le lot L2, chacun conditionné à la permission qu'exige sa garde serveur. */
function AdminScreens({ permissions }: { permissions: readonly PermissionCode[] }) {
  const screens = [
    {
      href: "/admin/vehicules",
      title: "Véhicules",
      description:
        "Recherche, création, publication, statut commercial, médias et prix ; fiche d'aperçu incluse.",
      allowed: permissions.includes("vehicle.view"),
    },
    {
      href: "/admin/referentiels",
      title: "Référentiels",
      description: "Marques, modèles, carrosseries, énergies, boîtes, couleurs, équipements et caractéristiques.",
      allowed: permissions.includes("content.manage"),
    },
  ].filter((screen) => screen.allowed);

  return (
    <section aria-labelledby="back-office-ecrans" className="grid gap-4">
      <h2 id="back-office-ecrans" className="text-lg font-semibold text-[#011D4F]">
        Gestion livrée
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2">
        {screens.map((screen) => (
          <li key={screen.href} className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-[#011D4F]">{screen.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{screen.description}</p>
            <Link
              href={screen.href}
              className="mt-4 inline-block text-sm font-semibold text-[#0063DF] hover:text-[#0354A3]"
            >
              Ouvrir
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-sm text-slate-600">
        Les autres écrans du portail opérationnel (clients, prospects, commandes, personnel, audit) arrivent aux lots
        suivants.
      </p>
    </section>
  );
}
