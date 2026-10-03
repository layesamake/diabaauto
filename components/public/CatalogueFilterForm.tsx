"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CatalogueFilters } from "@/services/catalogue.service";
import { formatViewVehicles, fr } from "@/lib/i18n";

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

const SELECT_BASE =
  "h-12 w-full appearance-none rounded-xl border bg-white pl-3.5 pr-10 text-[15px] text-[#071525] transition-colors hover:border-[#0063DF] focus-visible:border-[#0063DF]";
const SELECT_IDLE = "border-[#c5d3e6]";
const SELECT_ACTIVE = "border-[#0063DF] bg-[#eef5ff] font-bold text-[#011D4F]";
const INPUT_CLASS =
  "h-12 w-full rounded-xl border border-[#c5d3e6] bg-white px-3.5 text-[15px] text-[#071525] transition-colors hover:border-[#0063DF] focus-visible:border-[#0063DF]";
const LABEL_CLASS = "text-[13px] font-bold text-[#011D4F]";
const LINK_CLASS =
  "inline-flex items-center gap-2 rounded-lg px-1 py-2 text-sm font-bold text-[#011D4F] hover:text-[#0063DF]";

const LOCATION_OPTIONS = ["CHINA", "IN_TRANSIT", "SENEGAL"] as const;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

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
  highlight = true,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  allLabel?: string;
  highlight?: boolean;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}) {
  const active = highlight && value !== "";

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={onChange}
          className={`${SELECT_BASE} ${active ? SELECT_ACTIVE : SELECT_IDLE}`}
        >
          {allLabel !== undefined ? <option value="">{allLabel}</option> : null}
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="#011D4F"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}

export function CatalogueFilterForm({
  facets,
  initial,
  basePath = "/voitures",
  idPrefix = "filtre",
  hideBrand = false,
  resultCount,
}: {
  facets: FilterFacets;
  initial: CatalogueFilters;
  basePath?: string;
  idPrefix?: string;
  hideBrand?: boolean;
  /** Nombre de véhicules du résultat affiché (celui de l'URL courante). */
  resultCount?: number;
}) {
  const router = useRouter();
  const [values, setValues] = useState<FilterValues>(() => initialValues(initial));
  const [showMore, setShowMore] = useState(
    () => initial.availability === "all" || (initial.sort !== undefined && initial.sort !== "recent"),
  );

  const electricFuelId =
    facets.fuelTypes.find((fuelType) => {
      const name = normalize(fuelType.name);
      return name === "electrique" || name === "electric";
    })?.id ?? null;

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

  // Le total affiché correspond à l'URL courante : il n'est exact que si rien n'est en attente
  // d'envoi (recherche ou années saisies sans validation).
  const pending = toQuery(values) !== toQuery(initialValues(initial));
  const submitLabel =
    resultCount !== undefined && !pending ? formatViewVehicles(resultCount) : fr.common.applyFilters;

  const locationChoices: { value: string; label: string }[] = [
    { value: "", label: fr.catalogue.locationShortAll },
    ...LOCATION_OPTIONS.map((option) => ({ value: option, label: fr.labels.logisticsLocation[option] })),
  ];

  return (
    <form
      role="search"
      className="flex flex-col gap-7 rounded-3xl border border-[#d5e0ee] bg-white p-5 shadow-[0_8px_30px_rgba(1,29,79,0.08)] sm:p-8"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(values);
      }}
    >
      <h2 className="text-2xl font-bold leading-tight text-[#011D4F] sm:text-3xl">
        {fr.catalogue.filtersTitle}
      </h2>

      <div className="flex h-14 items-center gap-3 rounded-2xl border border-[#c5d3e6] bg-white pl-4 pr-1.5 focus-within:border-[#0063DF] sm:h-[60px]">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="#46586f"
          strokeWidth="2"
          strokeLinecap="round"
          className="shrink-0"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <label htmlFor={`${idPrefix}-recherche`} className="sr-only">
          {fr.catalogue.searchLabel}
        </label>
        <input
          id={`${idPrefix}-recherche`}
          name="search"
          type="search"
          value={values.search}
          placeholder={fr.common.searchPlaceholder}
          onChange={(event) => setValues({ ...values, search: event.target.value })}
          className="min-w-0 flex-1 bg-transparent text-base text-[#071525] outline-none"
        />
        <button
          type="submit"
          aria-label={fr.catalogue.searchSubmit}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0063DF] text-white hover:bg-[#0354A3]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div role="group" aria-labelledby={`${idPrefix}-localisation-titre`} className="flex flex-col gap-2">
        <span id={`${idPrefix}-localisation-titre`} className={LABEL_CLASS}>
          {fr.catalogue.locationQuestion}
        </span>
        <div className="flex w-full gap-1 rounded-[14px] border border-[#dbe5f1] bg-[#f4f7fb] p-1 sm:w-fit">
          {locationChoices.map((choice) => {
            const pressed = values.logisticsLocation === choice.value;

            return (
              <button
                key={choice.value || "all"}
                type="button"
                aria-pressed={pressed}
                onClick={() => changeSelect("logisticsLocation", choice.value)}
                className={`h-10 flex-1 rounded-[10px] px-3 text-sm font-bold transition-colors sm:flex-none sm:px-5 ${
                  pressed ? "bg-[#0063DF] text-white" : "text-[#011D4F] hover:bg-white"
                }`}
              >
                {choice.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4 lg:gap-x-5">
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

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-annee-min`} className={LABEL_CLASS}>
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
            className={INPUT_CLASS}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-annee-max`} className={LABEL_CLASS}>
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
            className={INPUT_CLASS}
          />
        </div>
      </div>

      {showMore ? (
        <div
          id={`${idPrefix}-plus`}
          className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-[#e3ebf5] pt-6 lg:grid-cols-4 lg:gap-x-5"
        >
          <FilterSelect
            id={`${idPrefix}-disponibilite`}
            label={fr.catalogue.availabilityLabel}
            value={values.availability}
            highlight={false}
            onChange={(event) => changeSelect("availability", event.target.value)}
          >
            <option value="available">{fr.labels.availability.available}</option>
            <option value="all">{fr.labels.availability.all}</option>
          </FilterSelect>

          <FilterSelect
            id={`${idPrefix}-tri`}
            label={fr.catalogue.sortLabel}
            value={values.sort}
            highlight={false}
            onChange={(event) => changeSelect("sort", event.target.value)}
          >
            <option value="recent">{fr.labels.sort.recent}</option>
            <option value="price_asc">{fr.labels.sort.price_asc}</option>
            <option value="price_desc">{fr.labels.sort.price_desc}</option>
            <option value="year_desc">{fr.labels.sort.year_desc}</option>
            <option value="mileage_asc">{fr.labels.sort.mileage_asc}</option>
          </FilterSelect>
        </div>
      ) : null}

      <div className="contents sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:border-t sm:border-[#e3ebf5] sm:pt-6">
        <div className="flex flex-wrap items-center gap-x-7 gap-y-1">
          {electricFuelId !== null ? (
            <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-bold text-[#011D4F]">
              <input
                type="checkbox"
                checked={values.fuelTypeId === electricFuelId}
                onChange={(event) => changeSelect("fuelTypeId", event.target.checked ? electricFuelId : "")}
                className="h-5 w-5 cursor-pointer rounded-md border-2 border-[#7f98ba] accent-[#0063DF]"
              />
              {fr.catalogue.electricOnly}
            </label>
          ) : null}

          <button
            type="button"
            onClick={() => {
              const empty = initialValues({});
              setValues(empty);
              navigate(empty);
            }}
            className={LINK_CLASS}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
            </svg>
            {fr.common.resetFilters}
          </button>

          <button
            type="button"
            aria-expanded={showMore}
            aria-controls={`${idPrefix}-plus`}
            onClick={() => setShowMore(!showMore)}
            className={LINK_CLASS}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="8" cy="17" r="2" />
            </svg>
            {showMore ? fr.catalogue.lessFilters : fr.catalogue.moreFilters}
          </button>
        </div>

        <div className="sticky bottom-0 z-10 -mx-5 -mb-5 rounded-b-3xl border-t border-[#dbe5f1] bg-white px-5 pb-5 pt-3 shadow-[0_-8px_24px_rgba(1,29,79,0.08)] sm:static sm:z-auto sm:m-0 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
        <button
          type="submit"
          className="inline-flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-[#0063DF] px-7 text-base font-bold text-white hover:bg-[#0354A3] sm:w-auto"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          {submitLabel}
        </button>
        </div>
      </div>
    </form>
  );
}
