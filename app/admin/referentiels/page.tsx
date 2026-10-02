import type { Metadata } from "next";
import Link from "next/link";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ReferentialPanel } from "@/components/admin/ReferentialPanel";
import { REFERENTIAL_FORM_FIELDS, REFERENTIAL_SCREEN_ORDER, type SelectOption } from "@/components/admin/admin-view";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { createAdminMetadata, resolveAdminAccess } from "@/app/admin/guard";
import {
  REFERENTIAL_DESCRIPTORS,
  listReferential,
  type ReferentialKind,
} from "@/services/referential.service";

/**
 * Référentiels automobiles (doc 03 §5, contrat L2 §2.5).
 *
 * Garde serveur `content.manage` ; en cas de refus, aucune donnée n'est lue ni affichée. Le type
 * affiché est choisi par le paramètre d'URL `type` (GET) ; la liste inclut les éléments désactivés,
 * puisque l'écran sert aussi à les réactiver.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Référentiels — Back-office Diaba Auto",
  "Marques, modèles, carrosseries, énergies, boîtes, couleurs et caractéristiques.",
);

const PARENT_KIND: Record<"brand" | "vehicleModel" | "optionCategory", ReferentialKind> = {
  brand: "brand",
  vehicleModel: "vehicleModel",
  optionCategory: "optionCategory",
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(params: SearchParams, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export default async function AdminReferentialsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await resolveAdminAccess("content.manage");

  if (!access.granted) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <AdminHeader
          permissions={[]}
          title="Référentiels"
          subtitle="Accès réservé au personnel habilité."
          current="referentiels"
        />
        <div className="mt-8">
          <AdminAccessDenied code={access.denial.code} message={access.denial.message} />
        </div>
      </main>
    );
  }

  const params = await searchParams;
  const requested = firstParam(params, "type");
  const kind: ReferentialKind = REFERENTIAL_SCREEN_ORDER.find((value) => value === requested) ?? "brand";

  let panel: React.ReactNode;
  try {
    const rows = await listReferential(access.actor, kind, { includeInactive: true });

    const parentOptions: Partial<Record<string, SelectOption[]>> = {};
    const parentsNeeded = REFERENTIAL_FORM_FIELDS[kind]
      .map((field) => field.optionsFrom)
      .filter((source): source is "brand" | "vehicleModel" | "optionCategory" => source !== undefined);

    for (const source of new Set(parentsNeeded)) {
      const parentRows = await listReferential(access.actor, PARENT_KIND[source], { includeInactive: false });
      parentOptions[
        source === "brand" ? "brandId" : source === "vehicleModel" ? "modelId" : "categoryId"
      ] = parentRows.map((row) => ({ value: row.id, label: row.name }));
    }

    panel = (
      <ReferentialPanel
        kind={kind}
        rows={rows}
        parentOptions={parentOptions}
        activatable={REFERENTIAL_DESCRIPTORS[kind].activatable}
        canManage
      />
    );
  } catch {
    panel = (
      <section role="alert" className="rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
        <h2 className="text-lg font-semibold text-[#7a5310]">Référentiel indisponible</h2>
        <p className="mt-2 text-sm text-[#7a5310]">
          Les valeurs de référentiel n&apos;ont pas pu être chargées. Aucune donnée n&apos;est affichée ; réessayez après
          rétablissement du service de données.
        </p>
      </section>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <AdminHeader
        permissions={access.actor.permissions}
        title="Référentiels"
        subtitle="Valeurs automobiles partagées par les fiches véhicule."
        current="referentiels"
        logout={<LogoutButton action={logoutAction} />}
      />

      <nav aria-label="Types de référentiel" className="mt-8 flex flex-wrap gap-3">
        {REFERENTIAL_SCREEN_ORDER.map((value) =>
          value === kind ? (
            <span
              key={value}
              aria-current="page"
              className="rounded-lg bg-[#0063DF] px-3 py-1.5 text-sm font-semibold text-white"
            >
              {REFERENTIAL_DESCRIPTORS[value].label}
            </span>
          ) : (
            <Link
              key={value}
              href={`/admin/referentiels?type=${value}`}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-[#011D4F] hover:bg-[#f4f7fb]"
            >
              {REFERENTIAL_DESCRIPTORS[value].label}
            </Link>
          ),
        )}
      </nav>

      <div className="mt-6">{panel}</div>
    </main>
  );
}
