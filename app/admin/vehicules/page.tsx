import type { Metadata } from "next";
import Link from "next/link";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import {
  COMMERCIAL_STATUS_LABELS,
  COMMERCIAL_STATUSES,
  labelFor,
  orEmpty,
  type SelectOption,
} from "@/components/admin/admin-view";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { createAdminMetadata, resolveAdminAccess } from "@/app/admin/guard";
import { listVehicles, type VehicleListFilters } from "@/services/vehicle.service";

/**
 * Liste des véhicules du back-office (doc 03 §6, lot L2).
 *
 * Garde serveur `vehicle.view` ; en cas de refus, aucune donnée n'est lue ni affichée. Les filtres
 * sont passés en GET (partageables, aucun état client) : recherche, statut commercial, publication.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Véhicules — Back-office Diaba Auto",
  "Liste et recherche des véhicules.",
);

const PAGE_SIZE = 20;

const STATUS_FILTER_OPTIONS: SelectOption[] = COMMERCIAL_STATUSES.map((status) => ({
  value: status,
  label: labelFor(COMMERCIAL_STATUS_LABELS, status),
}));

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(params: SearchParams, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function buildHref(params: SearchParams, overrides: Record<string, string | null>): string {
  const query = new URLSearchParams();

  for (const key of ["recherche", "statut", "publication"]) {
    const value = firstParam(params, key);
    if (value.length > 0) {
      query.set(key, value);
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value.length === 0) {
      query.delete(key);
    } else {
      query.set(key, value);
    }
  }

  const rendered = query.toString();
  return rendered.length > 0 ? `/admin/vehicules?${rendered}` : "/admin/vehicules";
}

function parseFilters(params: SearchParams): { filters: VehicleListFilters; page: number } {
  const search = firstParam(params, "recherche").trim();
  const statusRaw = firstParam(params, "statut");
  const publication = firstParam(params, "publication");
  const pageRaw = Number.parseInt(firstParam(params, "page"), 10);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const filters: VehicleListFilters = { page, pageSize: PAGE_SIZE };
  if (search.length > 0) {
    filters.search = search;
  }

  const status = COMMERCIAL_STATUSES.find((value) => value === statusRaw);
  if (status) {
    filters.commercialStatus = status;
  }

  if (publication === "oui") {
    filters.isPublished = true;
  } else if (publication === "non") {
    filters.isPublished = false;
  }

  return { filters, page };
}

export default async function AdminVehiclesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await resolveAdminAccess("vehicle.view");

  if (!access.granted) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <AdminHeader
          permissions={[]}
          title="Véhicules"
          subtitle="Accès réservé au personnel habilité."
          current="vehicules"
        />
        <div className="mt-8">
          <AdminAccessDenied code={access.denial.code} message={access.denial.message} />
        </div>
      </main>
    );
  }

  const permissions = access.actor.permissions;
  const params = await searchParams;
  const { filters, page } = parseFilters(params);

  let content: React.ReactNode;
  try {
    const { items, total } = await listVehicles(access.actor, filters);
    content = <VehicleTable items={items} total={total} params={params} page={page} />;
  } catch {
    content = (
      <section role="alert" className="rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
        <h2 className="text-lg font-semibold text-[#7a5310]">Liste indisponible</h2>
        <p className="mt-2 text-sm text-[#7a5310]">
          La liste des véhicules n&apos;a pas pu être chargée. Les filtres restent affichés ; réessayez après
          rétablissement du service de données.
        </p>
      </section>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <AdminHeader
        permissions={permissions}
        title="Véhicules"
        subtitle="Recherche, publication et suivi commercial."
        current="vehicules"
        logout={<LogoutButton action={logoutAction} />}
      />

      <form method="get" action="/admin/vehicules" className="mt-8 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-4">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="filtre-recherche" className="text-sm font-medium text-[#011D4F]">
            Recherche
          </label>
          <input
            id="filtre-recherche"
            name="recherche"
            type="search"
            defaultValue={firstParam(params, "recherche")}
            placeholder="Référence, titre, slug"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-[#071525]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-statut" className="text-sm font-medium text-[#011D4F]">
            Statut commercial
          </label>
          <select
            id="filtre-statut"
            name="statut"
            defaultValue={firstParam(params, "statut")}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-[#071525]"
          >
            <option value="">Tous</option>
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-publication" className="text-sm font-medium text-[#011D4F]">
            Publication
          </label>
          <select
            id="filtre-publication"
            name="publication"
            defaultValue={firstParam(params, "publication")}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-[#071525]"
          >
            <option value="">Toutes</option>
            <option value="oui">Publiés</option>
            <option value="non">Non publiés</option>
          </select>
        </div>
        <div className="flex gap-3 sm:col-span-4">
          <button
            type="submit"
            className="rounded-lg bg-[#0063DF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0354A3]"
          >
            Filtrer
          </button>
          <Link
            href="/admin/vehicules"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-[#011D4F] hover:bg-[#f4f7fb]"
          >
            Réinitialiser
          </Link>
          {permissions.includes("vehicle.create") ? (
            <Link
              href="/admin/vehicules/nouveau"
              className="ml-auto rounded-lg bg-[#0063DF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0354A3]"
            >
              Nouveau véhicule
            </Link>
          ) : null}
        </div>
      </form>

      <div className="mt-8">{content}</div>
    </main>
  );
}

function VehicleTable({
  items,
  total,
  params,
  page,
}: {
  items: { id: string; reference: string; title: string; year: number; commercialStatus: string; isPublished: boolean; featured: boolean; mileage: number | null }[];
  total: number;
  params: SearchParams;
  page: number;
}) {
  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">Aucun véhicule ne correspond à ces critères.</p>
      </section>
    );
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-600">
        {total} véhicule(s) — page {page} sur {lastPage}.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Liste des véhicules</caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-2 pr-3">Référence</th>
              <th scope="col" className="py-2 pr-3">Titre</th>
              <th scope="col" className="py-2 pr-3">Année</th>
              <th scope="col" className="py-2 pr-3">Kilométrage</th>
              <th scope="col" className="py-2 pr-3">Statut</th>
              <th scope="col" className="py-2 pr-3">Publié</th>
              <th scope="col" className="py-2">Fiche</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-2 pr-3 font-medium text-[#011D4F]">{item.reference}</td>
                <td className="py-2 pr-3">
                  {item.title}
                  {item.featured ? (
                    <span className="ml-2 rounded-full bg-[#e8f4ff] px-2 py-0.5 text-xs font-semibold text-[#0354A3]">
                      En avant
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-3">{item.year}</td>
                <td className="py-2 pr-3">{item.mileage === null ? orEmpty(null) : `${item.mileage} km`}</td>
                <td className="py-2 pr-3">{labelFor(COMMERCIAL_STATUS_LABELS, item.commercialStatus)}</td>
                <td className="py-2 pr-3">{item.isPublished ? "Oui" : "Non"}</td>
                <td className="py-2">
                  <Link
                    href={`/admin/vehicules/${item.id}`}
                    className="font-semibold text-[#0063DF] hover:text-[#0354A3]"
                  >
                    Ouvrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lastPage > 1 ? (
        <nav aria-label="Pagination" className="mt-4 flex gap-4 text-sm font-semibold">
          {page > 1 ? (
            <Link href={buildHref(params, { page: String(page - 1) })} className="text-[#0063DF] hover:text-[#0354A3]">
              Page précédente
            </Link>
          ) : null}
          {page < lastPage ? (
            <Link href={buildHref(params, { page: String(page + 1) })} className="text-[#0063DF] hover:text-[#0354A3]">
              Page suivante
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
