"use client";

import { useState } from "react";
import type { AdminActionState } from "@/app/admin/actions";
import { createVehicleAction, updateVehicleAction } from "@/app/admin/actions";
import { AdminForm } from "@/components/admin/AdminForm";
import {
  AdminCheckboxField,
  AdminSelectField,
  AdminTextareaField,
  AdminTextField,
} from "@/components/admin/AdminFields";
import {
  LOGISTICS_LOCATIONS,
  LOGISTICS_LOCATION_LABELS,
  VEHICLE_CONDITIONS,
  VEHICLE_CONDITION_LABELS,
  type SelectOption,
} from "@/components/admin/admin-view";
import type { VehicleDetail } from "@/services/vehicle.service";

/**
 * Formulaire véhicule du back-office (création et modification).
 *
 * React 18.3 : état local + `AdminForm` (pas de `useActionState`). Le composant ne valide rien : il
 * transmet le `FormData` à la Server Action, qui appelle le service. Aucun champ privilégié
 * (référence, slug, statut, publication, dates d'archivage) n'est rendu ni transmis.
 */

/** Option de référentiel avec son rattachement, pour la cascade marque → modèle → génération. */
export type DependentOption = SelectOption & { parentId: string | null };

export type VehicleReferentialOptions = {
  brands: SelectOption[];
  models: DependentOption[];
  generations: DependentOption[];
  trims: DependentOption[];
  fuelTypes: SelectOption[];
  transmissionTypes: SelectOption[];
  bodyTypes: SelectOption[];
  colors: SelectOption[];
};

const NONE_LABEL = "— Aucune —";
const NONE_LABEL_SHORT = "—";

export function VehicleForm({
  mode,
  vehicle,
  options,
}: {
  mode: "create" | "edit";
  vehicle?: VehicleDetail;
  options: VehicleReferentialOptions;
}) {
  const [brandId, setBrandId] = useState(vehicle?.brandId ?? "");
  const [modelId, setModelId] = useState(vehicle?.modelId ?? "");

  const action = (formData: FormData): Promise<AdminActionState> =>
    mode === "create" ? createVehicleAction(formData) : updateVehicleAction(formData);

  const modelOptions = options.models
    .filter((model) => brandId.length > 0 && model.parentId === brandId)
    .map((model) => ({ value: model.value, label: model.label }));
  const generationOptions = options.generations
    .filter((generation) => modelId.length > 0 && generation.parentId === modelId)
    .map((generation) => ({ value: generation.value, label: generation.label }));
  const trimOptions = options.trims
    .filter((trim) => modelId.length > 0 && trim.parentId === modelId)
    .map((trim) => ({ value: trim.value, label: trim.label }));

  return (
    <AdminForm
      action={action}
      submitLabel={mode === "create" ? "Créer le véhicule" : "Enregistrer les modifications"}
      pendingLabel={mode === "create" ? "Création…" : "Enregistrement…"}
      className="flex flex-col gap-6"
    >
      {mode === "edit" && vehicle ? <input type="hidden" name="vehicleId" value={vehicle.id} /> : null}

      <fieldset className="rounded-xl border border-slate-200 bg-white p-5">
        <legend className="px-2 text-sm font-semibold text-[#011D4F]">Identification</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminTextField
            id="vehicle-title"
            name="title"
            label="Titre de l'annonce"
            required
            defaultValue={vehicle?.title}
            hint="Visible par le client : ne contient ni référence interne, ni donnée fournisseur."
          />
          <AdminTextField
            id="vehicle-slug"
            name="slug"
            label="Identifiant d'URL (facultatif)"
            hint="Laissé vide, il est dérivé du titre par le serveur."
          />
        </div>
        <div className="mt-4">
          <AdminTextareaField
            id="vehicle-description"
            name="description"
            label="Description"
            defaultValue={vehicle?.description ?? ""}
            rows={4}
          />
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-slate-200 bg-white p-5">
        <legend className="px-2 text-sm font-semibold text-[#011D4F]">Référentiel</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminSelectField
            id="vehicle-brand"
            name="brandId"
            label="Marque"
            required
            emptyLabel={NONE_LABEL_SHORT}
            value={brandId}
            onChange={(event) => {
              setBrandId(event.target.value);
              setModelId("");
            }}
            options={options.brands}
          />
          <AdminSelectField
            id="vehicle-model"
            name="modelId"
            label="Modèle"
            required
            emptyLabel={NONE_LABEL_SHORT}
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            options={modelOptions}
          />
          <AdminSelectField
            id="vehicle-generation"
            name="generationId"
            label="Génération"
            emptyLabel={NONE_LABEL}
            defaultValue={vehicle?.generationId ?? ""}
            options={generationOptions}
          />
          <AdminSelectField
            id="vehicle-trim"
            name="trimId"
            label="Finition"
            emptyLabel={NONE_LABEL}
            defaultValue={vehicle?.trimId ?? ""}
            options={trimOptions}
          />
        </div>
        {modelOptions.length === 0 ? (
          <p className="mt-2 text-xs text-slate-600">
            Aucun modèle actif n&apos;est rattaché à cette marque : créez-le dans les référentiels.
          </p>
        ) : null}
      </fieldset>

      <fieldset className="rounded-xl border border-slate-200 bg-white p-5">
        <legend className="px-2 text-sm font-semibold text-[#011D4F]">Caractéristiques</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminSelectField
            id="vehicle-condition"
            name="condition"
            label="État"
            required
            defaultValue={vehicle?.condition ?? "USED"}
            options={VEHICLE_CONDITIONS.map((condition) => ({
              value: condition,
              label: VEHICLE_CONDITION_LABELS[condition],
            }))}
          />
          <AdminTextField
            id="vehicle-year"
            name="year"
            label="Année"
            type="number"
            min={1900}
            max={2100}
            required
            defaultValue={vehicle?.year}
          />
          <AdminTextField
            id="vehicle-first-registration"
            name="firstRegistrationDate"
            label="Première mise en circulation"
            type="date"
            defaultValue={vehicle?.firstRegistrationDate?.toISOString().slice(0, 10)}
          />
          <AdminTextField
            id="vehicle-mileage"
            name="mileage"
            label="Kilométrage"
            type="number"
            min={0}
            defaultValue={vehicle?.mileage ?? undefined}
          />
          <AdminTextField
            id="vehicle-previous-owners"
            name="previousOwners"
            label="Nombre de propriétaires précédents"
            type="number"
            min={0}
            defaultValue={vehicle?.previousOwners ?? undefined}
          />
          <AdminSelectField
            id="vehicle-fuel"
            name="fuelTypeId"
            label="Énergie"
            required
            emptyLabel={NONE_LABEL_SHORT}
            defaultValue={vehicle?.fuelTypeId ?? ""}
            options={options.fuelTypes}
          />
          <AdminSelectField
            id="vehicle-transmission"
            name="transmissionTypeId"
            label="Boîte de vitesses"
            required
            emptyLabel={NONE_LABEL_SHORT}
            defaultValue={vehicle?.transmissionTypeId ?? ""}
            options={options.transmissionTypes}
          />
          <AdminSelectField
            id="vehicle-body"
            name="bodyTypeId"
            label="Carrosserie"
            required
            emptyLabel={NONE_LABEL_SHORT}
            defaultValue={vehicle?.bodyTypeId ?? ""}
            options={options.bodyTypes}
          />
          <AdminSelectField
            id="vehicle-exterior-color"
            name="exteriorColorId"
            label="Couleur extérieure"
            emptyLabel={NONE_LABEL}
            defaultValue={vehicle?.exteriorColorId ?? ""}
            options={options.colors}
          />
          <AdminSelectField
            id="vehicle-interior-color"
            name="interiorColorId"
            label="Couleur intérieure"
            emptyLabel={NONE_LABEL}
            defaultValue={vehicle?.interiorColorId ?? ""}
            options={options.colors}
          />
          <AdminTextField
            id="vehicle-doors"
            name="doors"
            label="Nombre de portes"
            type="number"
            min={1}
            max={7}
            defaultValue={vehicle?.doors ?? undefined}
          />
          <AdminTextField
            id="vehicle-seats"
            name="seats"
            label="Nombre de places"
            type="number"
            min={1}
            defaultValue={vehicle?.seats ?? undefined}
          />
          <AdminTextField
            id="vehicle-power-kw"
            name="powerKw"
            label="Puissance (kW)"
            type="number"
            step="0.01"
            min={0}
            defaultValue={vehicle?.powerKw ?? undefined}
          />
          <AdminTextField
            id="vehicle-power-hp"
            name="powerHp"
            label="Puissance (ch)"
            type="number"
            step="0.01"
            min={0}
            defaultValue={vehicle?.powerHp ?? undefined}
          />
          <AdminTextField
            id="vehicle-displacement"
            name="engineDisplacement"
            label="Cylindrée (cm³)"
            type="number"
            min={0}
            defaultValue={vehicle?.engineDisplacement ?? undefined}
          />
          <AdminSelectField
            id="vehicle-accident"
            name="accidentKnown"
            label="Accident connu"
            emptyLabel={NONE_LABEL}
            defaultValue={
              vehicle?.accidentKnown === null || vehicle?.accidentKnown === undefined
                ? ""
                : String(vehicle.accidentKnown)
            }
            options={[
              { value: "true", label: "Oui" },
              { value: "false", label: "Non" },
            ]}
          />
          <AdminSelectField
            id="vehicle-service-history"
            name="serviceHistoryAvailable"
            label="Historique d'entretien disponible"
            emptyLabel={NONE_LABEL}
            defaultValue={
              vehicle?.serviceHistoryAvailable === null || vehicle?.serviceHistoryAvailable === undefined
                ? ""
                : String(vehicle.serviceHistoryAvailable)
            }
            options={[
              { value: "true", label: "Oui" },
              { value: "false", label: "Non" },
            ]}
          />
          <AdminSelectField
            id="vehicle-logistics"
            name="logisticsLocation"
            label="Localisation logistique"
            required
            defaultValue={vehicle?.logisticsLocation ?? "CHINA"}
            options={LOGISTICS_LOCATIONS.map((location) => ({
              value: location,
              label: LOGISTICS_LOCATION_LABELS[location],
            }))}
          />
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-slate-200 bg-white p-5">
        <legend className="px-2 text-sm font-semibold text-[#011D4F]">Approvisionnement</legend>
        <p className="mb-4 text-xs text-slate-600">
          Informations internes : elles ne sont jamais publiées sur la fiche client.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminTextField
            id="vehicle-supplier-reference"
            name="supplierReference"
            label="Référence fournisseur"
            defaultValue={vehicle?.supplierReference ?? ""}
          />
          <AdminTextField
            id="vehicle-supplier-name"
            name="supplierName"
            label="Fournisseur"
            defaultValue={vehicle?.supplierName ?? ""}
          />
          <AdminTextField
            id="vehicle-source-type"
            name="sourceType"
            label="Type de source"
            defaultValue={vehicle?.sourceType ?? ""}
          />
          <AdminTextField
            id="vehicle-source-url"
            name="sourceUrl"
            label="URL de la source"
            type="url"
            defaultValue={vehicle?.sourceUrl ?? ""}
          />
        </div>
        <div className="mt-4">
          <AdminCheckboxField
            id="vehicle-featured"
            name="featured"
            label="Mettre en avant sur le catalogue"
            defaultChecked={vehicle?.featured ?? false}
          />
        </div>
      </fieldset>
    </AdminForm>
  );
}
