"use client";

import {
  cancelReservationAction,
  confirmReservationAction,
  createReservationAction,
  expireReservationAction,
  rejectDepositAction,
  reportDepositAction,
  verifyDepositAction,
} from "@/app/admin/commandes/actions";
import { AdminForm } from "@/components/admin/AdminForm";
import {
  AdminCheckboxField,
  AdminTextareaField,
  AdminTextField,
} from "@/components/admin/AdminFields";
import { formatDateTime, orEmpty } from "@/components/admin/admin-view";
import {
  depositStatusLabel,
  reservationStatusLabel,
  staffOrdersFr as msg,
} from "@/lib/i18n/staff-orders.fr";
import {
  depositTransitions,
  reservationTransitions,
  type DepositStatus,
  type ReservationStatus,
} from "@/services/transitions.service";
import type { ReservationView } from "@/services/reservation.service";

/**
 * Panneau de réservations d'un véhicule et d'acompte externe — contrat lot 6 §3.1, §3.2, §4 et §6.
 *
 * Les transitions proposées proviennent des machines à états (`reservationTransitions`,
 * `depositTransitions`, doc 09 §5-§6) : ce composant n'affiche que des cibles autorisées. Chaque
 * action n'est proposée qu'au porteur de `vehicle.reserve`, mais ce n'est qu'une aide : le service
 * (`services/reservation.service.ts`) revérifie la transition, la disponibilité et la permission.
 *
 * Aucun encaissement n'existe (BR-101/BR-102) : l'acompte n'est qu'un contrôle externe enregistré
 * (référence, montant, devise). « CONVERTIR COMMANDE » n'est pas une action de ce panneau : elle est
 * portée par la création d'une commande sur le même véhicule.
 */

const RESERVATION_STATUS_BADGE_CLASS: Readonly<Record<ReservationStatus, string>> = {
  PENDING: "bg-[#fdf6e6] text-[#7a5310]",
  CONFIRMED: "bg-[#e8f4ff] text-[#0354A3]",
  CANCELLED: "bg-slate-100 text-slate-600",
  EXPIRED: "bg-[#fdf2f1] text-[#95312a]",
  CONVERTED: "bg-[#effaf3] text-[#036b4b]",
};

const DEPOSIT_STATUS_BADGE_CLASS: Readonly<Record<DepositStatus, string>> = {
  NOT_REQUIRED: "bg-slate-100 text-slate-600",
  REQUESTED: "bg-[#fdf6e6] text-[#7a5310]",
  REPORTED: "bg-[#e8f4ff] text-[#0354A3]",
  VERIFIED: "bg-[#effaf3] text-[#036b4b]",
  REJECTED: "bg-[#fdf2f1] text-[#95312a]",
};

type ReservationAction = "CONFIRM" | "CANCEL" | "EXPIRE";

/** Action de réservation par cible autorisée ; `null` = transition portée ailleurs (conversion). */
const RESERVATION_ACTION_BY_TARGET: Readonly<Record<ReservationStatus, ReservationAction | null>> = {
  PENDING: null,
  CONFIRMED: "CONFIRM",
  CANCELLED: "CANCEL",
  EXPIRED: "EXPIRE",
  CONVERTED: null,
};

const RESERVATION_ACTION_LABELS: Readonly<
  Record<ReservationAction, { submit: string; pending: string }>
> = {
  CONFIRM: {
    submit: msg.reservation.confirm,
    pending: msg.reservation.confirmPending,
  },
  CANCEL: {
    submit: msg.reservation.cancel,
    pending: msg.reservation.cancelPending,
  },
  EXPIRE: {
    submit: msg.reservation.expire,
    pending: msg.reservation.expirePending,
  },
};

type DepositAction = "REPORT" | "VERIFY" | "REJECT";

/** Action d'acompte par cible autorisée ; `null` = état sans action possible. */
const DEPOSIT_ACTION_BY_TARGET: Readonly<Record<DepositStatus, DepositAction | null>> = {
  NOT_REQUIRED: null,
  REQUESTED: null,
  REPORTED: "REPORT",
  VERIFIED: "VERIFY",
  REJECTED: "REJECT",
};

function allowedReservationActions(status: ReservationStatus): ReservationAction[] {
  return reservationTransitions(status)
    .map((target) => RESERVATION_ACTION_BY_TARGET[target])
    .filter((action): action is ReservationAction => action !== null);
}

function allowedDepositActions(status: DepositStatus): DepositAction[] {
  return depositTransitions(status)
    .map((target) => DEPOSIT_ACTION_BY_TARGET[target])
    .filter((action): action is DepositAction => action !== null);
}

export function ReservationPanel({
  vehicleId,
  defaultCustomerId,
  reservations,
  canReserve,
}: {
  vehicleId: string;
  defaultCustomerId: string;
  reservations: ReservationView[];
  canReserve: boolean;
}) {
  return (
    <section aria-labelledby="order-reservations" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="order-reservations" className="text-lg font-semibold text-[#011D4F]">
        {msg.reservation.title}
      </h2>
      <p className="mt-2 text-sm text-slate-600">{msg.reservation.intro}</p>

      {canReserve ? (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <h3 className="text-base font-semibold text-[#011D4F]">{msg.reservation.createTitle}</h3>
          <CreateReservationForm vehicleId={vehicleId} defaultCustomerId={defaultCustomerId} />
        </div>
      ) : null}

      {reservations.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">{msg.reservation.empty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {reservations.map((reservation) => (
            <ReservationItem key={reservation.id} reservation={reservation} canReserve={canReserve} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CreateReservationForm({
  vehicleId,
  defaultCustomerId,
}: {
  vehicleId: string;
  defaultCustomerId: string;
}) {
  return (
    <AdminForm
      action={createReservationAction}
      submitLabel={msg.reservation.createSubmit}
      pendingLabel={msg.reservation.createPending}
      fallbackError={msg.messages.genericError}
      resetOnSuccess
      className="mt-3 flex flex-col gap-3"
    >
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminTextField
          id={`reservation-customer-${vehicleId}`}
          name="customerId"
          label={msg.reservation.customerId}
          hint={msg.reservation.customerIdHint}
          required
          defaultValue={defaultCustomerId}
        />
        <AdminTextField
          id={`reservation-lead-${vehicleId}`}
          name="leadId"
          label={msg.reservation.leadId}
        />
        <AdminTextField
          id={`reservation-expires-${vehicleId}`}
          name="expiresAt"
          type="date"
          label={msg.reservation.expiresAt}
        />
        <AdminTextField
          id={`reservation-agreement-${vehicleId}`}
          name="agreedPrice"
          label={msg.reservation.agreement}
        />
        <AdminTextField
          id={`reservation-deposit-amount-${vehicleId}`}
          name="depositAmount"
          label={msg.reservation.depositAmount}
        />
        <AdminTextField
          id={`reservation-deposit-currency-${vehicleId}`}
          name="depositCurrency"
          label={msg.reservation.depositCurrency}
          defaultValue="XOF"
        />
      </div>
      <AdminCheckboxField
        id={`reservation-deposit-required-${vehicleId}`}
        name="depositRequired"
        label={msg.reservation.depositRequired}
        hint={msg.reservation.depositRequiredHint}
      />
    </AdminForm>
  );
}

function ReservationItem({
  reservation,
  canReserve,
}: {
  reservation: ReservationView;
  canReserve: boolean;
}) {
  const reservationActions = allowedReservationActions(reservation.status);
  const depositActions = allowedDepositActions(reservation.depositStatus);
  const canConvert = reservationTransitions(reservation.status).includes("CONVERTED");

  return (
    <li className="rounded-lg border border-slate-100 bg-[#f4f7fb] px-3 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold text-[#011D4F]">{reservation.reference}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RESERVATION_STATUS_BADGE_CLASS[reservation.status]}`}>
          {reservationStatusLabel(reservation.status)}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DEPOSIT_STATUS_BADGE_CLASS[reservation.depositStatus]}`}>
          {msg.reservation.fields.depositStatus} : {depositStatusLabel(reservation.depositStatus)}
        </span>
      </div>

      <dl className="mt-2 grid gap-x-6 gap-y-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={msg.reservation.fields.expiresAt} value={formatDateTime(reservation.expiresAt)} />
        <Fact
          label={msg.reservation.fields.agreedPrice}
          value={money(reservation.agreedPrice, reservation.depositCurrency)}
        />
        <Fact
          label={msg.reservation.fields.depositAmount}
          value={money(reservation.depositAmount, reservation.depositCurrency)}
        />
        <Fact
          label={msg.reservation.fields.depositReference}
          value={orEmpty(reservation.externalDepositReference)}
        />
        <Fact
          label={msg.reservation.fields.confirmed}
          value={reservation.confirmed ? msg.reservation.yes : msg.reservation.no}
        />
        <Fact label={msg.reservation.fields.createdAt} value={formatDateTime(reservation.createdAt)} />
      </dl>

      {!canReserve ? (
        <p className="mt-3 text-xs text-slate-600">{msg.reservation.readOnly}</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-start gap-4 border-t border-slate-200 pt-3">
          {reservationActions.map((action) => (
            <ReservationActionForm key={action} reservationId={reservation.id} action={action} />
          ))}
          {depositActions.map((action) => (
            <DepositActionForm key={action} reservationId={reservation.id} action={action} />
          ))}
          {canConvert ? <p className="w-full text-xs text-slate-600">{msg.reservation.convertHint}</p> : null}
        </div>
      )}
    </li>
  );
}

function ReservationActionForm({
  reservationId,
  action,
}: {
  reservationId: string;
  action: ReservationAction;
}) {
  const labels = RESERVATION_ACTION_LABELS[action];
  const config = {
    CONFIRM: confirmReservationAction,
    CANCEL: cancelReservationAction,
    EXPIRE: expireReservationAction,
  }[action];

  return (
    <AdminForm
      action={config}
      submitLabel={labels.submit}
      pendingLabel={labels.pending}
      fallbackError={msg.messages.genericError}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="reservationId" value={reservationId} />
    </AdminForm>
  );
}

function DepositActionForm({
  reservationId,
  action,
}: {
  reservationId: string;
  action: DepositAction;
}) {
  if (action === "REPORT") {
    return (
      <details className="text-xs">
        <summary className="cursor-pointer font-semibold text-[#0063DF] hover:text-[#0354A3]">
          {msg.reservation.depositReportTitle}
        </summary>
        <div className="mt-2 w-72">
          <AdminForm
            action={reportDepositAction}
            submitLabel={msg.reservation.depositReportSubmit}
            pendingLabel={msg.reservation.depositReportPending}
            fallbackError={msg.messages.genericError}
            className="flex flex-col gap-2"
          >
            <input type="hidden" name="reservationId" value={reservationId} />
            <AdminTextField
              id={`deposit-reference-${reservationId}`}
              name="externalDepositReference"
              label={msg.reservation.depositReference}
              hint={msg.reservation.depositReferenceHint}
              required
            />
            <AdminTextField
              id={`deposit-amount-${reservationId}`}
              name="depositAmount"
              label={msg.reservation.depositAmount}
            />
            <AdminTextField
              id={`deposit-currency-${reservationId}`}
              name="depositCurrency"
              label={msg.reservation.depositCurrency}
              defaultValue="XOF"
            />
          </AdminForm>
        </div>
      </details>
    );
  }

  if (action === "REJECT") {
    return (
      <details className="text-xs">
        <summary className="cursor-pointer font-semibold text-[#0063DF] hover:text-[#0354A3]">
          {msg.reservation.depositRejectTitle}
        </summary>
        <div className="mt-2 w-72">
          <AdminForm
            action={rejectDepositAction}
            submitLabel={msg.reservation.depositRejectSubmit}
            pendingLabel={msg.reservation.depositRejectPending}
            fallbackError={msg.messages.genericError}
            className="flex flex-col gap-2"
          >
            <input type="hidden" name="reservationId" value={reservationId} />
            <AdminTextareaField
              id={`deposit-reject-reason-${reservationId}`}
              name="reason"
              label={msg.reservation.depositRejectReason}
              rows={2}
            />
          </AdminForm>
        </div>
      </details>
    );
  }

  return (
    <AdminForm
      action={verifyDepositAction}
      submitLabel={msg.reservation.depositVerify}
      pendingLabel={msg.reservation.depositVerifyPending}
      fallbackError={msg.messages.genericError}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="reservationId" value={reservationId} />
    </AdminForm>
  );
}

/** Montant + devise ; `null` retombe sur un texte neutre, jamais sur une supposition. */
function money(amount: string | null, currency: string | null): string {
  if (!amount) {
    return "Non renseigné";
  }

  return currency ? `${amount} ${currency}` : amount;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="break-words font-medium text-[#071525]">{value}</dd>
    </div>
  );
}
