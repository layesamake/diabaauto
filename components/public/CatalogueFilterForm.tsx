"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CatalogueFilters } from "@/services/catalogue.service";
import { fr } from "@/lib/i18n";

/**
 * Formulaire de filtres du catalogue (contrat §B.1).
 *
 * Les filtres vivent dans l'URL et sont lus côté serveur : ce composant ne conserve aucun état de
 * données dupliqué, il ne fait que pousser une nouvelle URL (`useRouter`).
 */
export type FilterFacets = {
  brands: { id: string; name: string; slug: string }[];
  models: { id: string; name: string; brandId: string }[];
  bodyTypes: { id: string; name: string }[];
  fuelTypes: { id: string; name: string }[];
  transmissionTypes: { id: string; name: string }[];
};

type FilterValues = {
  search: string;
  brandId: string;
  modelId: string;
  bodyTypeId: string;
  fuelTypeId: string;
  transmissionTypeId: string;
  condition: string;
  logisticsLocation: string;
  yearMin: string;
  yearMax: string;
  availability: string;
  sort: string;
};

const CONTROL_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#071525] focus:border-[#0063DF]";

function initialValues(filters: CatalogueFilters): FilterValues {
  return {
    search: filters.search ?? "",
    brandId: filters.brandId ?? "",
    modelId: filters.modelId ?? "",
    bodyTypeId: filters.bodyTypeId ?? "",
    fuelTypeId: filters.fuelTypeId ?? "",
    transmissionTypeId: filters.transmissionTypeId ?? "",
    condition: filters.condition ?? "",
    logisticsLocation: filters.logisticsLocation ?? "",
    yearMin: filters.yearMin !== undefined ? String(filters.yearMin) : "",
    yearMax: filters.yearMax !== undefined ? String(filters.yearMax) : "",
    availability: filters.availability === "all" ? "all" : "available",
    sort: filters.sort ?? "recent",
  };
}

function toQuery(values: FilterValues): string {
  const params = new URLSearchParams();

  const append = (key: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed !== "") {
      params.set(key, trimmed);
    }
  };

  append("search", values.search);
  append("brandId", values.brandId);
  append("modelId", values.modelId);
  append("bodyTypeId", values.bodyTypeId);
  append("fuelTypeId", values.fuelTypeId);
  append("transmissionTypeId", values.transmissionTypeId);
  append("condition", values.condition);
  append("logisticsLocation", values.logisticsLocation);
  append("yearMin", values.yearMin);
  append("yearMax", values.yearMax);

  if (values.availability === "all") {
    params.set("availability", "all");
  }

  if (values.sort !== "recent") {
    params.set("sort", values.sort);
  }

  return params.toString();
}

function FilterSelect({
  id,
  label,
  value,
  allLabel,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  allLabel?: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-[#011D4F]">
        {label}
      </label>
      <select id={id} value={value} onChange={onChange} className={CONTROL_CLASS}>
        {allLabel !== undefined ? <option value="">{allLabel}</option> : null}
        {children}
      </select>
    </div>
  );
}

export function CatalogueFilterForm({
  facets,
  initial,
  basePath = "/voitures",
  idPrefix = "filtre",
  hideBrand = false,
}: {
  facets: FilterFacets;
  initial: CatalogueFilters;
  basePath?: string;
  idPrefix?: string;
  hideBrand?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<FilterValues>(() => initialValues(initial));

  const models = values.brandId
    ? facets.models.filter((model) => model.brandId === values.brandId)
    : facets.models;

  function navigate(next: FilterValues) {
    const query = toQuery(next);
    router.push(query === "" ? basePath : `${basePath}?${query}`);
  }

  function apply(next: FilterValues) {
    setValues(next);
    navigate(next);
  }

  function changeSelect(name: keyof FilterValues, value: string) {
    const next: FilterValues = { ...values };
    next[name] = value;

    if (name === "brandId") {
      next.modelId = "";
    }

    apply(next);
  }

  return (
    <form
      role="search"
      className="rounded-2xl border border-slate-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(values);
      }}
    >
      <h2 className="text-base font-semibold text-[#011D4F]">{fr.catalogue.filtersTitle}</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor={`${idPrefix}-recherche`} className="text-sm font-medium text-[#011D4F]">
            {fr.catalogue.searchLabel}
          </label>
          <input
            id={`${idPrefix}-recherche`}
            name="search"
            type="search"
            value={values.search}
            placeholder={fr.common.searchPlaceholder}
            onChange={(event) => setValues({ ...values, search: event.target.value })}
            className={CONTROL_CLASS}
          />
        </div>

        {hideBrand ? null : (
          <FilterSelect
            id={`${idPrefix}-marque`}
            label={fr.catalogue.brandLabel}
            value={values.brandId}
            allLabel={fr.catalogue.brandAll}
            onChange={(event) => changeSelect("brandId", event.target.value)}
          >
            {facets.brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </FilterSelect>
        )}

        <FilterSelect
          id={`${idPrefix}-modele`}
          label={fr.catalogue.modelLabel}
          value={values.modelId}
          allLabel={fr.catalogue.modelAll}
          onChange={(event) => changeSelect("modelId", event.target.value)}
        >
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          id={`${idPrefix}-carrosserie`}
          label={fr.catalogue.bodyLabel}
          value={values.bodyTypeId}
          allLabel={fr.catalogue.bodyAll}
          onChange={(event) => changeSelect("bodyTypeId", event.target.value)}
        >
          {facets.bodyTypes.map((bodyType) => (
            <option key={bodyType.id} value={bodyType.id}>
              {bodyType.name}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          id={`${idPrefix}-energie`}
          label={fr.catalogue.fuelLabel}
          value={values.fuelTypeId}
          allLabel={fr.catalogue.fuelAll}
          onChange={(event) => changeSelect("fuelTypeId", event.target.value)}
        >
          {facets.fuelTypes.map((fuelType) => (
            <option key={fuelType.id} value={fuelType.id}>
              {fuelType.name}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          id={`${idPrefix}-boite`}
          label={fr.catalogue.transmissionLabel}
          value={values.transmissionTypeId}
          allLabel={fr.catalogue.transmissionAll}
          onChange={(event) => changeSelect("transmissionTypeId", event.target.value)}
        >
          {facets.transmissionTypes.map((transmission) => (
            <option key={transmission.id} value={transmission.id}>
              {transmission.name}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          id={`${idPrefix}-etat`}
          label={fr.catalogue.conditionLabel}
          value={values.condition}
          allLabel={fr.catalogue.conditionAll}
          onChange={(event) => changeSelect("condition", event.target.value)}
        >
          <option value="NEW">{fr.labels.condition.NEW}</option>
          <option value="USED">{fr.labels.condition.USED}</option>
        </FilterSelect>

        <FilterSelect
          id={`${idPrefix}-localisation`}
          label={fr.catalogue.locationLabel}
          value={values.logisticsLocation}
          allLabel={fr.catalogue.locationAll}
          onChange={(event) => changeSelect("logisticsLocation", event.target.value)}
        >
          <option value="CHINA">{fr.labels.logisticsLocation.CHINA}</option>
          <option value="IN_TRANSIT">{fr.labels.logisticsLocation.IN_TRANSIT}</option>
          <option value="SENEGAL">{fr.labels.logisticsLocation.SENEGAL}</option>
        </FilterSelect>

        <FilterSelect
          id={`${idPrefix}-disponibilite`}
          label={fr.catalogue.availabilityLabel}
          value={values.availability}
          onChange={(event) => changeSelect("availability", event.target.value)}
        >
          <option value="available">{fr.labels.availability.available}</option>
          <option value="all">{fr.labels.availability.all}</option>
        </FilterSelect>

        <FilterSelect
          id={`${idPrefix}-tri`}
          label={fr.catalogue.sortLabel}
          value={values.sort}
          onChange={(event) => changeSelect("sort", event.target.value)}
        >
          <option value="recent">{fr.labels.sort.recent}</option>
          <option value="price_asc">{fr.labels.sort.price_asc}</option>
          <option value="price_desc">{fr.labels.sort.price_desc}</option>
          <option value="year_desc">{fr.labels.sort.year_desc}</option>
          <option value="mileage_asc">{fr.labels.sort.mileage_asc}</option>
        </FilterSelect>

        <div>
          <label htmlFor={`${idPrefix}-annee-min`} className="text-sm font-medium text-[#011D4F]">
            {fr.catalogue.yearMinLabel}
          </label>
          <input
            id={`${idPrefix}-annee-min`}
            name="yearMin"
            type="number"
            inputMode="numeric"
            min={1900}
            max={2100}
            value={values.yearMin}
            onChange={(event) => setValues({ ...values, yearMin: event.target.value })}
            className={CONTROL_CLASS}
          />
        </div>

        <div>
          <label htmlFor={`${idPrefix}-annee-max`} className="text-sm font-medium text-[#011D4F]">
            {fr.catalogue.yearMaxLabel}
          </label>
          <input
            id={`${idPrefix}-annee-max`}
            name="yearMax"
            type="number"
            inputMode="numeric"
            min={1900}
            max={2100}
            value={values.yearMax}
            onChange={(event) => setValues({ ...values, yearMax: event.target.value })}
            className={CONTROL_CLASS}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="submit"
          className="rounded-lg bg-[#0063DF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0354A3]"
        >
          {fr.common.applyFilters}
        </button>
        <button
          type="button"
          onClick={() => {
            const empty = initialValues({});
            setValues(empty);
            navigate(empty);
          }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-[#011D4F]"
        >
          {fr.common.resetFilters}
        </button>
      </div>
    </form>
  );
}