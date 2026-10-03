import type { Metadata } from "next";
import Link from "next/link";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { COMMERCIAL_STATUS_LABELS, labelFor, orEmpty } from "@/components/admin/admin-view";
import {
  VEHICLE_TABS,
  VEHICLE_TAB_EMPTY,
  VEHICLE_TAB_LABELS,
  countOfTab,
  parseVehicleTab,
  stageOfTab,
  vehicleTabHref,
  type VehicleTab,
} from "@/components/admin/vehicle-list-view";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { createAdminMetadata, resolveAdminAccess } from "@/app/admin/guard";
import { vehicleTodos } from "@/services/vehicle-journey.service";
import { listVehicles, type VehicleListEntry, type VehicleListFilters } from "@/services/vehicle.service";

/**
 * Liste des véhicules du back-office (doc 03 §6, lot L2).
 *
 * Garde serveur `vehicle.view` ; en cas de refus, aucune donnée n'est lue ni affichée. Une seule
 * recherche et des onglets par étape (En ligne, Prêts à publier, À compléter, Vendus), chacun avec
 * son effectif. Tout est dans l'URL (`?etat=`, `?recherche=`, `?page=`) : partageable, sans état
 * client. La colonne « Ce qu'il reste à faire » mène droit à l'étape de la fiche qui règle chaque point.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Véhicules — Back-office Diaba Auto",
  "Liste et recherche des véhicules.",
);

const PAGE_SIZE = 20;

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(params: SearchParams, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function parseQuery(params: SearchParams): { filters: VehicleListFilters; tab: VehicleTab; search: string; page: number } {
  const search = firstParam(params, "recherche").trim().slice(0, 120);
  const tab = parseVehicleTab(firstParam(params, "etat"));
  const pageRaw = Number.parseInt(firstParam(params, "page"), 10);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const filters: VehicleListFilters = { page, pageSize: PAGE_SIZE };
  if (search.length > 0) {
    filters.search = search;
  }

  const stage = stageOfTab(tab);
  if (stage) {
    filters.stage = stage;
  }

  return { filters, tab, search, page };
}

export default async function AdminVehiclesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await resolveAdminAccess("vehicle.view");

  if (!access.granted) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <AdminHeader title="Véhicules" subtitle="Accès réservé au personnel habilité." />
        <div className="mt-8">
          <AdminAccessDenied code={access.denial.code} message={access.denial.message} />
        </div>
      </main>
    );
  }

  const permissions = access.actor.permissions;
  const params = await searchParams;
  const { filters, tab, search, page } = parseQuery(params);

  let result: Awaited<ReturnType<typeof listVehicles>> | null = null;
  try {
    result = await listVehicles(access.actor, filters);
  } catch {
    result = null;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <AdminHeader
        title="Véhicules"
        subtitle="Le stock, ce qui est en ligne et ce qu'il reste à faire pour publier."
        logout={<LogoutButton action={logoutAction} />}
      />

      <div className="mt-8 flex flex-wrap items-end gap-3">
        <form method="get" action="/admin/vehicules" role="search" className="flex min-w-[260px] flex-1 flex-wrap items-end gap-3">
          {tab !== "tous" ? <input type="hidden" name="etat" value={tab} /> : null}
          <div className="flex min-w-[220px] flex-1 flex-col gap-1">
            <label htmlFor="vehicules-recherche" className="text-sm font-medium text-[#011D4F]">
              Rechercher une référence ou un titre
            </label>
            <input
              id="vehicules-recherche"
              name="recherche"
              type="search"
              defaultValue={search}
              maxLength={120}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-[#071525]"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-[#0063DF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0354A3]"
          >
            Rechercher
          </button>
          {search ? (
            <Link
              href={vehicleTabHref(tab, "")}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-[#011D4F] hover:bg-[#f4f7fb]"
            >
              Effacer
            </Link>
          ) : null}
        </form>
        {permissions.includes("vehicle.create") ? (
          <Link
            href="/admin/vehicules/nouveau"
            className="rounded-lg bg-[#0063DF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0354A3]"
          >
            Nouveau véhicule
          </Link>
        ) : null}
      </div>

      {result ? (
        <>
          <nav aria-label="Filtrer par étape" className="mt-5 flex flex-wrap gap-2">
            {VEHICLE_TABS.map((item) => {
              const active = item === tab;
              return (
                <Link
                  key={item}
                  href={vehicleTabHref(item, search)}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm no-underline ${
                    active
                      ? "border-[#0063DF] bg-[#0063DF] font-semibold text-white"
                      : "border-slate-300 bg-white font-medium text-[#011D4F] hover:bg-[#f4f7fb]"
                  }`}
                >
                  {VEHICLE_TAB_LABELS[item]}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {countOfTab(result.stageCounts, item)}
                  </span>
                </Link>
              );
            })}
          </nav>

          <VehicleTable items={result.items} total={result.total} tab={tab} search={search} page={page} />
        </>
      ) : (
        <section role="alert" className="mt-8 rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
          <h2 className="text-lg font-semibold text-[#7a5310]">Liste indisponible</h2>
          <p className="mt-2 text-sm text-[#7a5310]">
            La liste des véhicules n&apos;a pas pu être chargée. Réessayez dans un instant ; vos données ne sont pas touchées.
          </p>
        </section>
      )}
    </main>
  );
}

/** Ce qu'il reste à faire sur une ligne : des liens vers l'étape qui règle chaque point. */
function TodoCell({ item }: { item: VehicleListEntry }) {
  const todos = vehicleTodos(item);

  if (todos.length === 0) {
    if (item.commercialStatus === "SOLD") {
      return <span className="text-slate-500">—</span>;
    }

    return item.isPublished ? (
      <span className="text-slate-500">En ligne, complet</span>
    ) : (
      <span className="inline-block rounded-md bg-[#e6f4ec] px-2 py-1 text-xs font-semibold text-[#0F5D3C]">
        Prêt à publier
      </span>
    );
  }

  return (
    <ul className="flex list-none flex-wrap gap-1.5 p-0">
      {todos.map((todo) => (
        <li key={todo.step}>
          <Link
            href={`/admin/vehicules/${item.id}?etape=${todo.step}`}
            className={`inline-block rounded-md px-2 py-1 text-xs font-semibold no-underline ${
              item.isPublished
                ? "bg-[#fbe9e7] text-[#8a2a1c] hover:bg-[#f7d9d4]"
                : "bg-[#fdf6e6] text-[#7a5310] hover:bg-[#faecc8]"
            }`}
          >
            {todo.label}
            <span className="sr-only"> — {item.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function VehicleTable({
  items,
  total,
  tab,
  search,
  page,
}: {
  items: VehicleListEntry[];
  total: number;
  tab: VehicleTab;
  search: string;
  page: number;
}) {
  if (items.length === 0) {
    return (
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">
          {search ? `Aucun véhicule ne correspond à « ${search} » dans cet onglet.` : VEHICLE_TAB_EMPTY[tab]}
        </p>
      </section>
    );
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-600">
        {total} {total > 1 ? "véhicules" : "véhicule"}
        {lastPage > 1 ? ` — page ${page} sur ${lastPage}` : ""}
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Liste des véhicules</caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-2 pr-3">Véhicule</th>
              <th scope="col" className="py-2 pr-3">Année</th>
              <th scope="col" className="py-2 pr-3">Kilométrage</th>
              <th scope="col" className="py-2 pr-3">Statut</th>
              <th scope="col" className="py-2 pr-3">En ligne</th>
              <th scope="col" className="py-2 pr-3">Ce qu&apos;il reste à faire</th>
              <th scope="col" className="py-2"><span className="sr-only">Fiche</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 align-top">
                <td className="py-3 pr-3">
                  <span className="block font-medium text-[#011D4F]">
                    {item.title}
                    {item.featured ? (
                      <span className="ml-2 rounded-full bg-[#e8f4ff] px-2 py-0.5 text-xs font-semibold text-[#0354A3]">
                        En avant
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-xs text-slate-600">{item.reference}</span>
                </td>
                <td className="py-3 pr-3">{item.year}</td>
                <td className="py-3 pr-3">{item.mileage === null ? orEmpty(null) : `${item.mileage} km`}</td>
                <td className="py-3 pr-3">{labelFor(COMMERCIAL_STATUS_LABELS, item.commercialStatus)}</td>
                <td className="py-3 pr-3">{item.isPublished ? "Oui" : "Non"}</td>
                <td className="py-3 pr-3">
                  <TodoCell item={item} />
                </td>
                <td className="py-3">
                  <Link
                    href={`/admin/vehicules/${item.id}`}
                    className="font-semibold text-[#0063DF] hover:text-[#0354A3]"
                  >
                    Ouvrir
                    <span className="sr-only"> — {item.title}</span>
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
            <Link href={vehicleTabHref(tab, search, page - 1)} className="text-[#0063DF] hover:text-[#0354A3]">
              Page précédente
            </Link>
          ) : null}
          {page < lastPage ? (
            <Link href={vehicleTabHref(tab, search, page + 1)} className="text-[#0063DF] hover:text-[#0354A3]">
              Page suivante
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
