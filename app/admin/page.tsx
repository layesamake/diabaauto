import type { Metadata } from "next";
import Link from "next/link";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { createAdminMetadata } from "@/app/admin/guard";
import { getCurrentActor } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/errors";
import { requireStaff } from "@/services/access.service";
import { listWorklist, type WorklistItem, type WorklistTone } from "@/services/admin-worklist.service";

/**
 * Accueil du back-office : ce qui attend une décision.
 *
 * Il affichait un annuaire des huit rubriques — il disait où aller, jamais quoi faire. La navigation
 * vit maintenant dans la barre latérale, et cet écran sert à autre chose : une liste d'actions
 * calculée sur les données réelles, chacune avec le lien qui la règle.
 *
 * L'accès exige `requireStaff(actor, "vehicle.view")` : session vérifiée, compte actif, puis
 * permission. C'est la permission la plus faible du portail opérationnel, portée par ADMIN comme par
 * le COMMERCIAL (D01). Un refus ne révèle aucune donnée.
 *
 * Chaque entrée n'est proposée qu'au porteur de la permission de l'écran qui la traite — la règle
 * est dans `services/admin-worklist.service.ts`, pas ici.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Back-office Diaba Auto",
  "Ce qui attend une décision.",
);

/** Habillage par ton : une ligne prête à publier ne se lit pas comme une relance en retard. */
const TONS: Record<WorklistTone, { pastille: string; bouton: string }> = {
  action: {
    pastille: "bg-[#FDEDE8] text-[#A63C17]",
    bouton: "bg-[#0063DF] text-white hover:bg-[#0354A3]",
  },
  attention: {
    pastille: "bg-[#FEF4E2] text-[#8A5100]",
    bouton: "border border-[#B9CEE8] bg-white text-[#0354A3] hover:border-[#0063DF]",
  },
  pret: {
    pastille: "bg-[#E6F4EC] text-[#0F7B4F]",
    bouton: "bg-[#0063DF] text-white hover:bg-[#0354A3]",
  },
};

export default async function AdminPage() {
  const actor = await getCurrentActor();
  const authenticated = actor.kind !== "visitor";

  let denial: { code: string; message: string } | null = null;
  let items: WorklistItem[] = [];
  let indisponible = false;

  try {
    requireStaff(actor, "vehicle.view");
  } catch (error) {
    denial = toErrorResponse(error).error;
  }

  if (!denial) {
    try {
      items = await listWorklist(actor);
    } catch {
      // Une panne de comptage ne doit pas fermer le back-office : les écrans restent accessibles
      // par la barre latérale, et on le dit plutôt que d'afficher une liste vide trompeuse.
      indisponible = true;
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <AdminHeader
        title="Aujourd'hui"
        subtitle="Ce qui attend une décision."
        logout={authenticated ? <LogoutButton action={logoutAction} /> : undefined}
      />

      <div className="mt-8 grid gap-6">
        {denial ? <AdminAccessDenied code={denial.code} message={denial.message} /> : null}

        {!denial && indisponible ? (
          <p className="rounded-xl border border-[#F3D5A7] bg-[#FEF9F0] p-5 text-sm text-[#7A4800]">
            La liste des points à traiter n&apos;a pas pu être calculée. Les écrans restent
            accessibles depuis le menu.
          </p>
        ) : null}

        {!denial && !indisponible ? <Worklist items={items} /> : null}
      </div>
    </main>
  );
}

function Worklist({ items }: { items: WorklistItem[] }) {
  if (items.length === 0) {
    return (
      <section
        aria-labelledby="a-traiter"
        className="rounded-xl border border-[#BFE3CE] bg-[#F3FAF6] p-6"
      >
        <h2 id="a-traiter" className="text-lg font-semibold text-[#0B6340]">
          Rien à traiter
        </h2>
        <p className="mt-2 text-sm text-[#2F5C47]">
          Aucune demande sans réponse, aucune relance due, aucun véhicule bloqué. Vous êtes à jour.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="a-traiter" className="grid gap-4">
      <div className="flex items-baseline gap-3">
        <h2 id="a-traiter" className="text-lg font-semibold text-[#011D4F]">
          À traiter
        </h2>
        <span className="text-sm text-slate-600">
          {items.length === 1 ? "1 point" : `${items.length} points`}
        </span>
      </div>

      <ul className="grid list-none gap-3 p-0">
        {items.map((item) => {
          const ton = TONS[item.tone];

          return (
            <li
              key={item.key}
              className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-5"
            >
              <span
                aria-hidden="true"
                className={`inline-flex h-10 w-10 flex-none items-center justify-center rounded-lg text-base font-bold tabular-nums ${ton.pastille}`}
              >
                {item.count}
              </span>

              <div className="min-w-0 flex-[999_1_240px]">
                <p className="text-[15px] font-semibold text-[#011D4F]">{item.title}</p>
                <p className="mt-0.5 text-sm text-slate-600">{item.detail}</p>
              </div>

              <Link
                href={item.href}
                className={`inline-flex min-h-[44px] items-center whitespace-nowrap rounded-lg px-5 text-sm font-semibold no-underline ${ton.bouton}`}
              >
                {item.actionLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
