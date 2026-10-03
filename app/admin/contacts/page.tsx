import type { Metadata } from "next";
import Link from "next/link";
import { createAdminMetadata } from "@/app/admin/guard";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { formatDate } from "@/components/admin/admin-view";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { getCurrentActor } from "@/lib/auth/session";
import { AppError, toErrorResponse } from "@/lib/errors";
import {
  CONTACT_KIND_LABELS,
  isContactTab,
  listContacts,
  visibleTabs,
  type ContactList,
  type ContactRow,
  type ContactTab,
} from "@/services/contact-list.service";

/**
 * Contacts : prospects, demandes sur mesure, clients et demandes Revendeur dans une seule liste.
 *
 * Chaque source est lue par son propre service, sous sa propre permission : l'écran n'accorde aucun
 * droit. Les filtres sont dans l'URL (`?onglet=`, `?recherche=`), donc partageables et sans état
 * client. L'onglet « À traiter » est l'onglet par défaut : c'est la question que se pose un
 * commercial en ouvrant l'écran.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Contacts — Back-office Diaba Auto",
  "Prospects, demandes, clients et revendeurs dans une seule liste.",
);

const TAB_LABELS: Readonly<Record<ContactTab, string>> = {
  "a-traiter": "À traiter",
  tous: "Tous",
  prospects: "Prospects",
  demandes: "Demandes",
  clients: "Clients",
  revendeurs: "Revendeurs",
};

const EMPTY_MESSAGES: Readonly<Record<ContactTab, string>> = {
  "a-traiter": "Rien n'attend de réponse. Tout est à jour.",
  tous: "Aucun contact pour l'instant.",
  prospects: "Aucun prospect.",
  demandes: "Aucune demande sur mesure.",
  clients: "Aucun client.",
  revendeurs: "Aucune demande Revendeur.",
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(params: SearchParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function tabHref(tab: ContactTab, search: string): string {
  const query = new URLSearchParams();
  if (tab !== "a-traiter") query.set("onglet", tab);
  if (search) query.set("recherche", search);
  const suffix = query.toString();

  return suffix ? `/admin/contacts?${suffix}` : "/admin/contacts";
}

export default async function AdminContactsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const rawTab = firstParam(params, "onglet");
  const tab: ContactTab = isContactTab(rawTab) ? rawTab : "a-traiter";
  const search = firstParam(params, "recherche").trim().slice(0, 100);

  const actor = await getCurrentActor();

  let list: ContactList | null = null;
  let failure: { denied: boolean; code: string; message: string } | null = null;
  try {
    list = await listContacts(actor, { tab, search });
  } catch (error) {
    const { error: shown } = toErrorResponse(error);
    const denied = error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED");
    failure = { denied, code: shown.code, message: shown.message };
  }

  if (failure?.denied) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <AdminHeader title="Contacts" subtitle="Accès réservé au personnel habilité." />
        <div className="mt-8">
          <AdminAccessDenied code={failure.code} message={failure.message} />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <AdminHeader
        title="Contacts"
        subtitle="Toutes les personnes qui s'intéressent à Diaba Auto, au même endroit."
        logout={<LogoutButton action={logoutAction} />}
      />

      {list ? (
        <>
          <nav aria-label="Filtrer les contacts" className="mt-8 flex flex-wrap gap-2">
            {visibleTabs(list.kinds).map((item) => {
              const active = item === tab;
              return (
                <Link
                  key={item}
                  href={tabHref(item, search)}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm no-underline ${
                    active
                      ? "border-[#0063DF] bg-[#0063DF] font-semibold text-white"
                      : "border-slate-300 bg-white font-medium text-[#011D4F] hover:bg-[#f4f7fb]"
                  }`}
                >
                  {TAB_LABELS[item]}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {list.counts[item]}
                  </span>
                </Link>
              );
            })}
          </nav>

          <form method="get" action="/admin/contacts" role="search" className="mt-4 flex flex-wrap gap-3">
            {tab !== "a-traiter" ? <input type="hidden" name="onglet" value={tab} /> : null}
            <div className="flex min-w-[240px] flex-1 flex-col gap-1">
              <label htmlFor="contacts-recherche" className="text-sm font-medium text-[#011D4F]">
                Rechercher un nom, un numéro, une référence
              </label>
              <input
                id="contacts-recherche"
                name="recherche"
                type="search"
                defaultValue={search}
                maxLength={100}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-[#071525]"
              />
            </div>
            <div className="flex items-end gap-3">
              <button
                type="submit"
                className="rounded-lg bg-[#0063DF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0354A3]"
              >
                Rechercher
              </button>
              {search ? (
                <Link
                  href={tabHref(tab, "")}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-[#011D4F] hover:bg-[#f4f7fb]"
                >
                  Effacer
                </Link>
              ) : null}
            </div>
          </form>

          <ContactTable rows={list.rows} tab={tab} search={search} />
        </>
      ) : (
        <section role="alert" className="mt-8 rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
          <h2 className="text-lg font-semibold text-[#7a5310]">Liste momentanément indisponible</h2>
          <p className="mt-2 text-sm text-[#7a5310]">
            Les contacts n'ont pas pu être chargés. Réessayez dans un instant ; vos données ne sont pas touchées.
          </p>
        </section>
      )}
    </main>
  );
}

function ContactTable({ rows, tab, search }: { rows: ContactRow[]; tab: ContactTab; search: string }) {
  if (rows.length === 0) {
    return (
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">
          {search ? `Aucun contact ne correspond à « ${search} » dans cet onglet.` : EMPTY_MESSAGES[tab]}
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-600">
        {rows.length} {rows.length > 1 ? "contacts" : "contact"}
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Contacts</caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-2 pr-3">Contact</th>
              <th scope="col" className="py-2 pr-3">Type</th>
              <th scope="col" className="py-2 pr-3">État</th>
              <th scope="col" className="py-2 pr-3">À faire</th>
              <th scope="col" className="py-2 pr-3">Depuis le</th>
              <th scope="col" className="py-2"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-slate-100 align-top">
                <td className="py-3 pr-3">
                  <span className="block font-medium text-[#011D4F]">{row.title}</span>
                  {row.detail ? <span className="block text-xs text-slate-600">{row.detail}</span> : null}
                </td>
                <td className="py-3 pr-3 text-slate-700">{CONTACT_KIND_LABELS[row.kind]}</td>
                <td className="py-3 pr-3 text-slate-700">{row.statusLabel}</td>
                <td className="py-3 pr-3">
                  {row.attention ? (
                    <span className="inline-block rounded-md bg-[#fdf6e6] px-2 py-1 text-xs font-semibold text-[#7a5310]">
                      {row.attention}
                    </span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="py-3 pr-3 text-slate-700">{formatDate(row.date)}</td>
                <td className="py-3">
                  <Link href={row.href} className="font-semibold text-[#0063DF] hover:text-[#0354A3]">
                    {row.actionLabel}
                    <span className="sr-only"> — {row.title}</span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
