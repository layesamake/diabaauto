"use client";

import { reviewResellerApplicationAction } from "@/app/admin/revendeurs/actions";
import { AdminTextareaField } from "@/components/admin/AdminFields";
import { AdminForm } from "@/components/admin/AdminForm";
import { formatDateTime, orEmpty } from "@/components/admin/admin-view";
import {
  resellerApplicationStatusLabel,
  resellerFr as msg,
} from "@/lib/i18n/reseller.fr";
import type { PermissionCode } from "@/services/permissions.service";
import {
  resellerApplicationTransitions,
  type ResellerApplicationStatus,
} from "@/services/transitions.service";
import type { ResellerApplicationView } from "@/services/reseller-application.service";
import Link from "next/link";

/**
 * Panneau « Demandes Revendeur » du back-office (contrat lot 5 §3 et §4).
 *
 * Liste les demandes et propose, pour chacune, les seules transitions autorisées par la machine à
 * états (doc 09 §3) que porte aussi le service : `resellerApplicationTransitions` est la source
 * unique, aucune transition illégale n'est rendue. Chaque action n'est proposée qu'au porteur de la
 * permission correspondante — mais ce n'est qu'une aide : la garde réelle reste appliquée par
 * `reviewResellerApplication` (`reseller.view` / `reseller.approve` / `reseller.reject`).
 *
 * Le composant ne valide rien lui-même : il transmet le `FormData` à la Server Action, qui appelle le
 * service. Aucun champ privilégié n'est rendu ni transmis (l'identifiant ne désigne que la cible).
 */

type ReviewAction = "START_REVIEW" | "APPROVE" | "REJECT" | "CANCEL";

const ACTION_BY_TARGET: Readonly<Record<ResellerApplicationStatus, ReviewAction | null>> = {
  PENDING: null,
  UNDER_REVIEW: "START_REVIEW",
  APPROVED: "APPROVE",
  REJECTED: "REJECT",
  CANCELLED: "CANCEL",
};

const PERMISSION_BY_ACTION: Readonly<Record<ReviewAction, PermissionCode>> = {
  START_REVIEW: "reseller.view",
  APPROVE: "reseller.approve",
  REJECT: "reseller.reject",
  CANCEL: "reseller.view",
};

const ACTION_LABELS: Readonly<Record<ReviewAction, string>> = {
  START_REVIEW: msg.actions.startReview,
  APPROVE: msg.actions.approve,
  REJECT: msg.actions.reject,
  CANCEL: msg.actions.cancel,
};

const STATUS_BADGE_CLASS: Readonly<Record<ResellerApplicationStatus, string>> = {
  PENDING: "bg-[#fdf6e6] text-[#7a5310]",
  UNDER_REVIEW: "bg-[#e8f4ff] text-[#0354A3]",
  APPROVED: "bg-[#effaf3] text-[#036b4b]",
  REJECTED: "bg-[#fdf2f1] text-[#95312a]",
  CANCELLED: "bg-slate-100 text-slate-600",
};

export function ResellerApplicationsPanel({
  rows,
  permissions,
  canViewCustomer,
}: {
  rows: ResellerApplicationView[];
  permissions: readonly PermissionCode[];
  canViewCustomer: boolean;
}) {
  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">{msg.empty}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-600">{msg.countLabel(rows.length)}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{msg.tableCaption}</caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-2 pr-3">{msg.table.companyName}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.businessType}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.estimatedVolume}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.status}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.createdAt}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.reviewedAt}</th>
              <th scope="col" className="py-2 pr-3">{msg.table.rejectionReason}</th>
              {canViewCustomer ? <th scope="col" className="py-2 pr-3">{msg.table.customer}</th> : null}
              <th scope="col" className="py-2">{msg.table.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ResellerApplicationRowItem
                key={row.id}
                row={row}
                permissions={permissions}
                canViewCustomer={canViewCustomer}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function allowedReviewActions(
  status: ResellerApplicationStatus,
  permissions: readonly PermissionCode[],
): ReviewAction[] {
  return resellerApplicationTransitions(status)
    .map((target) => ACTION_BY_TARGET[target])
    .filter((action): action is ReviewAction => action !== null)
    .filter((action) => permissions.includes(PERMISSION_BY_ACTION[action]));
}

function ResellerApplicationRowItem({
  row,
  permissions,
  canViewCustomer,
}: {
  row: ResellerApplicationView;
  permissions: readonly PermissionCode[];
  canViewCustomer: boolean;
}) {
  const actions = allowedReviewActions(row.status, permissions);

  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="py-2 pr-3 font-medium text-[#011D4F]">{row.companyName}</td>
      <td className="py-2 pr-3">{orEmpty(row.businessType)}</td>
      <td className="py-2 pr-3">{orEmpty(row.estimatedVolume)}</td>
      <td className="py-2 pr-3">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[row.status]}`}>
          {resellerApplicationStatusLabel(row.status)}
        </span>
      </td>
      <td className="py-2 pr-3">{formatDateTime(row.createdAt)}</td>
      <td className="py-2 pr-3">{formatDateTime(row.reviewedAt)}</td>
      <td className="py-2 pr-3">{orEmpty(row.rejectionReason)}</td>
      {canViewCustomer ? (
        <td className="py-2 pr-3">
          <Link
            href={`/admin/clients/${row.customerId}`}
            className="font-semibold text-[#0063DF] hover:text-[#0354A3]"
          >
            Ouvrir
          </Link>
        </td>
      ) : null}
      <td className="py-2">
        {actions.length === 0 ? (
          <span className="text-slate-500">—</span>
        ) : (
          <div className="flex flex-col gap-3">
            {actions.map((action) =>
              action === "REJECT" ? (
                <RejectForm key={action} applicationId={row.id} />
              ) : (
                <ReviewForm key={action} applicationId={row.id} action={action} />
              ),
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function ReviewForm({ applicationId, action }: { applicationId: string; action: ReviewAction }) {
  return (
    <AdminForm
      action={reviewResellerApplicationAction}
      submitLabel={ACTION_LABELS[action]}
      pendingLabel={msg.messages.pending}
      fallbackError={msg.messages.genericError}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="action" value={action} />
    </AdminForm>
  );
}

function RejectForm({ applicationId }: { applicationId: string }) {
  return (
    <details>
      <summary className="cursor-pointer text-xs font-semibold text-[#0063DF] hover:text-[#0354A3]">
        {msg.actions.reject}
      </summary>
      <div className="mt-2 w-64">
        <AdminForm
          action={reviewResellerApplicationAction}
          submitLabel={msg.actions.rejectConfirm}
          pendingLabel={msg.messages.pending}
          fallbackError={msg.messages.genericError}
          className="flex flex-col gap-2"
        >
          <input type="hidden" name="applicationId" value={applicationId} />
          <input type="hidden" name="action" value="REJECT" />
          <AdminTextareaField
            id={`reject-reason-${applicationId}`}
            name="rejectionReason"
            label={msg.actions.rejectionReasonLabel}
            hint={msg.actions.rejectionReasonHint}
            rows={3}
          />
        </AdminForm>
      </div>
    </details>
  );
}
