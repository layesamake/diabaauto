"use client";

import { AdminForm } from "@/components/admin/AdminForm";
import {
  AdminCheckboxField,
  AdminSelectField,
  AdminTextField,
} from "@/components/admin/AdminFields";
import {
  REFERENTIAL_FORM_FIELDS,
  orEmpty,
  type ReferentialFieldSpec,
  type SelectOption,
} from "@/components/admin/admin-view";
import {
  createReferentialAction,
  setReferentialActiveAction,
  updateReferentialAction,
} from "@/app/admin/actions";
import type { ReferentialKind, ReferentialRow } from "@/services/referential.service";

/**
 * Panneau référentiels (doc 03 §5, contrat L2 §2.5).
 *
 * Liste, création et activation/désactivation. Un référentiel utilisé ne se supprime pas : il se
 * désactive lorsque le modèle porte `is_active` (marques et modèles), sinon le service refuse. Les
 * champs de création proviennent des descripteurs partagés (`admin-view.ts`), les mêmes que ceux lus
 * par la Server Action.
 */

const NONE_LABEL_SHORT = "—";

export function ReferentialPanel({
  kind,
  rows,
  parentOptions,
  activatable,
  canManage,
}: {
  kind: ReferentialKind;
  rows: ReferentialRow[];
  parentOptions: Partial<Record<string, SelectOption[]>>;
  activatable: boolean;
  canManage: boolean;
}) {
  const fields = REFERENTIAL_FORM_FIELDS[kind];

  return (
    <div className="grid gap-6">
      {canManage ? (
        <section aria-labelledby="referential-create" className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 id="referential-create" className="text-lg font-semibold text-[#011D4F]">
            Nouvel élément
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Le code ou l&apos;identifiant d&apos;URL est normalisé par le service ; un doublon est refusé.
          </p>

          <AdminForm
            action={createReferentialAction}
            submitLabel="Créer"
            pendingLabel="Création…"
            resetOnSuccess
            className="mt-4 flex flex-col gap-4"
          >
            <input type="hidden" name="kind" value={kind} />
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((field) => (
                <ReferentialField key={field.name} field={field} parentOptions={parentOptions} />
              ))}
            </div>
          </AdminForm>
        </section>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600">
            Votre compte ne porte pas la permission de gestion des contenus : la liste est affichée en lecture seule.
          </p>
        </section>
      )}

      <section aria-labelledby="referential-list" className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 id="referential-list" className="text-lg font-semibold text-[#011D4F]">
          Éléments enregistrés
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {rows.length > 0
            ? `${rows.length} élément(s) enregistré(s).`
            : "Aucun élément enregistré pour ce type."}
        </p>

        {rows.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Éléments du référentiel</caption>
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="py-2 pr-3">Code</th>
                  <th scope="col" className="py-2 pr-3">Nom</th>
                  <th scope="col" className="py-2 pr-3">État</th>
                  {canManage ? <th scope="col" className="py-2">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <ReferentialRowItem
                    key={row.id}
                    kind={kind}
                    row={row}
                    activatable={activatable}
                    canManage={canManage}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ReferentialField({
  field,
  parentOptions,
}: {
  field: ReferentialFieldSpec;
  parentOptions: Partial<Record<string, SelectOption[]>>;
}) {
  const id = `referential-${field.name}`;

  if (field.control === "checkbox") {
    return <AdminCheckboxField id={id} name={field.name} label={field.label} hint={field.hint} />;
  }

  if (field.control === "select") {
    const options = field.optionsFrom ? (parentOptions[field.name] ?? []) : (field.options ?? []);
    return (
      <AdminSelectField
        id={id}
        name={field.name}
        label={field.label}
        required={field.required}
        hint={field.hint}
        emptyLabel={field.nullable ? "— Aucune —" : NONE_LABEL_SHORT}
        options={options}
      />
    );
  }

  return (
    <AdminTextField
      id={id}
      name={field.name}
      label={field.label}
      required={field.required}
      hint={field.hint}
      placeholder={field.placeholder}
    />
  );
}

function ReferentialRowItem({
  kind,
  row,
  activatable,
  canManage,
}: {
  kind: ReferentialKind;
  row: ReferentialRow;
  activatable: boolean;
  canManage: boolean;
}) {
  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="py-2 pr-3 break-all text-slate-700">{orEmpty(row.code)}</td>
      <td className="py-2 pr-3">{row.name}</td>
      <td className="py-2 pr-3">
        {row.isActive === null ? (
          <span className="text-slate-500">—</span>
        ) : row.isActive ? (
          <span className="rounded-full bg-[#effaf3] px-2 py-0.5 text-xs font-semibold text-[#036b4b]">Actif</span>
        ) : (
          <span className="rounded-full bg-[#fdf2f1] px-2 py-0.5 text-xs font-semibold text-[#95312a]">Inactif</span>
        )}
      </td>
      {canManage ? (
        <td className="py-2">
          <div className="flex flex-col gap-3">
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-[#0063DF] hover:text-[#0354A3]">
                Modifier le libellé
              </summary>
              <div className="mt-2 w-64">
                <AdminForm
                  action={updateReferentialAction}
                  submitLabel="Enregistrer"
                  pendingLabel="Enregistrement…"
                  className="flex flex-col gap-2"
                >
                  <input type="hidden" name="kind" value={kind} />
                  <input type="hidden" name="id" value={row.id} />
                  <AdminTextField id={`referential-name-${row.id}`} name="name" label="Nom" required defaultValue={row.name} />
                </AdminForm>
              </div>
            </details>

            {activatable && row.isActive !== null ? (
              <AdminForm
                action={setReferentialActiveAction}
                submitLabel={row.isActive ? "Désactiver" : "Activer"}
                pendingLabel="Mise à jour…"
                className="flex flex-col gap-2"
              >
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="isActive" value={row.isActive ? "false" : "true"} />
              </AdminForm>
            ) : null}
          </div>
        </td>
      ) : null}
    </tr>
  );
}
