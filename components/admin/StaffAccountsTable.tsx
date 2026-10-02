import { orEmpty } from "@/components/admin/admin-view";
import {
  StaffAccountEditForm,
  StaffAccountStatusForm,
} from "@/components/admin/StaffAccountEditForm";
import {
  staffAccountStatusLabel,
  staffAccountsFr as msg,
} from "@/lib/i18n/staff-accounts.fr";
import type { ProfileStatus } from "@/services/identity.service";
import type { StaffAccountView, StaffRoleOption } from "@/services/staff-account.service";

/**
 * Liste des comptes internes du back-office (contrat lot 7 §1).
 *
 * Pour chaque compte : nom, adresse e-mail, fonction, rôles et statut, puis un bloc « Gérer »
 * contenant le formulaire de modification (prénom, nom, fonction, rôles) et le formulaire de
 * changement de statut (motif obligatoire). Les formulaires sont des composants clients ; ce tableau
 * ne fait que présenter les données reçues de `listStaffAccounts`.
 *
 * La permission `user.manage` est déjà appliquée par la page (garde serveur) et par le service :
 * aucun contrôle d'autorisation n'est refait ici.
 */

const STATUS_BADGE_CLASS: Readonly<Record<ProfileStatus, string>> = {
  ACTIVE: "bg-[#effaf3] text-[#036b4b]",
  SUSPENDED: "bg-[#fdf6e6] text-[#7a5310]",
  DISABLED: "bg-slate-100 text-slate-600",
};

/** Libellés des rôles d'un compte, résolus par code depuis la liste des rôles connus. */
function roleLabels(roleCodes: readonly string[], roles: readonly StaffRoleOption[]): string {
  if (roleCodes.length === 0) {
    return msg.roles.none;
  }

  return roleCodes
    .map((code) => roles.find((role) => role.code === code)?.name ?? code)
    .join(", ");
}

export function StaffAccountsTable({
  accounts,
  roles,
}: {
  accounts: readonly StaffAccountView[];
  roles: readonly StaffRoleOption[];
}) {
  if (accounts.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">{msg.empty}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-600">{msg.countLabel(accounts.length)}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{msg.tableCaption}</caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-2 pr-3">{msg.table.name}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.email}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.jobTitle}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.roles}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.status}</th>
              <th scope="col" className="py-2">{msg.table.manage}</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.staffId} className="border-b border-slate-100 align-top">
                <td className="py-3 pr-3 font-medium text-[#011D4F]">
                  {`${account.firstName} ${account.lastName}`.trim()}
                </td>
                <td className="py-3 pr-3 break-all">{orEmpty(account.email)}</td>
                <td className="py-3 pr-3">{orEmpty(account.jobTitle)}</td>
                <td className="py-3 pr-3">{roleLabels(account.roleCodes, roles)}</td>
                <td className="py-3 pr-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[account.status]}`}
                  >
                    {staffAccountStatusLabel(account.status)}
                  </span>
                </td>
                <td className="py-3">
                  <details className="min-w-[18rem]">
                    <summary className="cursor-pointer text-sm font-semibold text-[#0063DF] hover:text-[#0354A3]">
                      {msg.table.manage}
                    </summary>
                    <div className="mt-3 grid gap-4">
                      <StaffAccountEditForm account={account} roles={roles} />
                      <StaffAccountStatusForm account={account} />
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
