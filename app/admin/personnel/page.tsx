import type { Metadata } from "next";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { createAdminMetadata, resolveAdminAccess } from "@/app/admin/guard";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { StaffAccountCreateForm } from "@/components/admin/StaffAccountCreateForm";
import { StaffAccountsTable } from "@/components/admin/StaffAccountsTable";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { staffAccountsFr as msg } from "@/lib/i18n/staff-accounts.fr";
import { listStaffAccounts } from "@/services/staff-account.service";

/**
 * Écran « Personnel » du back-office (contrat lot 7 §1, §2 et §4).
 *
 * Garde serveur `user.manage` (permission existante, ADMIN seul) ; en cas de refus, AUCUNE donnée
 * n'est lue ni affichée. L'écran gère les comptes **internes** (rôles ADMIN et COMMERCIAL) : les
 * comptes clients ne sont pas concernés (ils s'inscrivent eux-mêmes). « Supprimer » = désactiver,
 * réversible.
 *
 * Seuls des comptes `STAFF` sont listés (`listStaffAccounts`). Chaque action d'écriture est portée
 * par `app/admin/personnel/actions.ts` ; la permission et les règles sont appliquées par le service.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Personnel — Back-office Diaba Auto",
  "Comptes internes : rôles, fonction et activation.",
);

export default async function AdminStaffPage() {
  const access = await resolveAdminAccess("user.manage");

  if (!access.granted) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <AdminHeader
          permissions={[]}
          title={msg.listTitle}
          subtitle={msg.accessDeniedSubtitle}
          current="personnel"
        />
        <div className="mt-8">
          <AdminAccessDenied code={access.denial.code} message={access.denial.message} />
        </div>
      </main>
    );
  }

  const permissions = access.actor.permissions;

  let content: React.ReactNode;
  try {
    const { accounts, roles } = await listStaffAccounts(access.actor);
    content = (
      <>
        <details className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer text-base font-semibold text-[#011D4F]">
            {msg.create.title}
          </summary>
          <div className="mt-4">
            <StaffAccountCreateForm roles={roles} />
          </div>
        </details>

        <div className="mt-8">
          <StaffAccountsTable accounts={accounts} roles={roles} />
        </div>
      </>
    );
  } catch {
    content = (
      <section role="alert" className="mt-8 rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
        <h2 className="text-lg font-semibold text-[#7a5310]">{msg.unavailable.listTitle}</h2>
        <p className="mt-2 text-sm text-[#7a5310]">{msg.unavailable.listBody}</p>
      </section>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <AdminHeader
        permissions={permissions}
        title={msg.listTitle}
        subtitle={msg.listSubtitle}
        current="personnel"
        logout={<LogoutButton action={logoutAction} />}
      />
      {content}
    </main>
  );
}
