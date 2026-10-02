"use client";

import { AdminForm } from "@/components/admin/AdminForm";
import { AdminSelectField, AdminTextField } from "@/components/admin/AdminFields";
import {
  COMMERCIAL_STATUS_LABELS,
  COMMERCIAL_STATUS_TRANSITIONS,
  labelFor,
  type SelectOption,
} from "@/components/admin/admin-view";
import {
  archiveVehicleAction,
  changeCommercialStatusAction,
  publishVehicleAction,
  unpublishVehicleAction,
} from "@/app/admin/actions";
import type { PermissionCode } from "@/services/permissions.service";
import type { VehicleCommercialStatus } from "@/services/vehicle.service";

/**
 * Panneau de cycle de vie : publication, retrait, archivage et transitions commerciales.
 *
 * Les commandes affichées dépendent des permissions de l'acteur, mais ce n'est qu'une aide : le
 * service revérifie chaque permission et valide chaque transition. L'archivage et le retrait exigent
 * un motif (doc 09), comme les transitions sensibles (réservation, vente).
 */
export function VehicleStatusPanel({
  vehicleId,
  commercialStatus,
  isPublished,
  permissions,
}: {
  vehicleId: string;
  commercialStatus: VehicleCommercialStatus;
  isPublished: boolean;
  permissions: readonly PermissionCode[];
}) {
  const canPublish = permissions.includes("vehicle.publish");
  const statusOptions: SelectOption[] = COMMERCIAL_STATUS_TRANSITIONS[commercialStatus].map((status) => ({
    value: status,
    label: labelFor(COMMERCIAL_STATUS_LABELS, status),
  }));

  return (
    <section aria-labelledby="vehicle-status" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="vehicle-status" className="text-lg font-semibold text-[#011D4F]">
        Statut et publication
      </h2>
      <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <dt className="text-slate-500">Statut commercial</dt>
          <dd className="font-medium text-[#011D4F]">{labelFor(COMMERCIAL_STATUS_LABELS, commercialStatus)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Publié</dt>
          <dd className="font-medium text-[#011D4F]">{isPublished ? "Oui" : "Non"}</dd>
        </div>
      </dl>

      {!canPublish ? (
        <p className="mt-4 text-sm text-slate-600">
          Votre compte ne porte pas la permission de publication : ces commandes sont indisponibles.
        </p>
      ) : (
        <div className="mt-4 grid gap-6 border-t border-slate-200 pt-4 lg:grid-cols-3">
          {!isPublished ? (
            <AdminForm
              action={publishVehicleAction}
              submitLabel="Publier"
              pendingLabel="Publication…"
              className="flex flex-col gap-3"
            >
              <input type="hidden" name="vehicleId" value={vehicleId} />
              <p className="text-xs text-slate-600">
                La publication exige marque, modèle, année, état, localisation, une image principale publique et un
                prix actif Standard.
              </p>
            </AdminForm>
          ) : (
            <AdminForm
              action={unpublishVehicleAction}
              submitLabel="Dépublier"
              pendingLabel="Retrait…"
              className="flex flex-col gap-3"
            >
              <input type="hidden" name="vehicleId" value={vehicleId} />
              <AdminTextField id="unpublish-reason" name="reason" label="Motif du retrait" required />
            </AdminForm>
          )}

          {statusOptions.length > 0 ? (
            <AdminForm
              action={changeCommercialStatusAction}
              submitLabel="Changer le statut"
              pendingLabel="Mise à jour…"
              className="flex flex-col gap-3"
            >
              <input type="hidden" name="vehicleId" value={vehicleId} />
              <AdminSelectField
                id="commercial-status"
                name="status"
                label="Nouveau statut"
                required
                options={statusOptions}
              />
              <AdminTextField
                id="status-reason"
                name="reason"
                label="Motif (réservation, vente)"
                hint="Exigé par le service pour les transitions sensibles."
              />
            </AdminForm>
          ) : null}

          <AdminForm
            action={archiveVehicleAction}
            submitLabel="Archiver"
            pendingLabel="Archivage…"
            className="flex flex-col gap-3"
          >
            <input type="hidden" name="vehicleId" value={vehicleId} />
            <AdminTextField
              id="archive-reason"
              name="reason"
              label="Motif d'archivage"
              required
              hint="L'archivage retire le véhicule du catalogue."
            />
          </AdminForm>
        </div>
      )}
    </section>
  );
}
