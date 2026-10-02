import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminMetadata } from "@/app/admin/guard";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { PasswordChangeForm } from "@/components/admin/PasswordChangeForm";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { getCurrentActor } from "@/lib/auth/session";
import { accountFr } from "@/lib/i18n/account.fr";

/**
 * « Mon compte » du back-office — changement de mot de passe du membre du personnel connecté.
 *
 * Garde : session valide ET acteur de type `staff` actif. Aucune permission métier n'est exigée ici :
 * tout membre du personnel doit pouvoir changer son propre mot de passe, quel que soit son rôle.
 * Un visiteur, un client ou un compte suspendu est renvoyé vers la connexion — aucune donnée n'est
 * affichée avant la garde.
 *
 * Le mot de passe n'est ni lu, ni affiché, ni journalisé côté serveur : seule la Server Action
 * `changePasswordAction` le traite, après re-authentification par le mot de passe actuel.
 */

export const metadata: Metadata = createAdminMetadata(
  "Mon compte — back-office Diaba Auto",
  "Sécurité de votre accès au back-office Diaba Auto.",
);

export default async function AdminAccountPage() {
  const actor = await getCurrentActor();

  if (actor.kind !== "staff" || !actor.active) {
    redirect("/connexion?suivant=%2Fadmin%2Fcompte");
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <AdminHeader
        permissions={actor.permissions}
        title={accountFr.title}
        subtitle={accountFr.subtitle}
        current="compte"
        logout={<LogoutButton action={logoutAction} />}
      />

      <div className="mt-8 grid gap-6">
        <PasswordChangeForm />
      </div>
    </main>
  );
}
