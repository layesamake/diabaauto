import type { Metadata } from "next";
import Link from "next/link";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { VehicleForm } from "@/components/admin/VehicleForm";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { loadVehicleReferentialOptions } from "@/app/admin/catalog-options";
import { createAdminMetadata, resolveAdminAccess } from "@/app/admin/guard";

/**
 * Création d'un véhicule.
 *
 * Garde serveur `vehicle.create` ; en cas de refus, aucune donnée n'est lue ni affichée. La référence
 * `DBC-YYYY-NNNNNN` et le slug sont attribués par le serveur, jamais par le formulaire.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Nouveau véhicule — Back-office Diaba Auto",
  "Création d'un véhicule.",
);

export default async function AdminNewVehiclePage() {
  const access = await resolveAdminAccess("vehicle.create");

  if (!access.granted) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <AdminHeader
          permissions={[]}
          title="Nouveau véhicule"
          subtitle="Accès réservé au personnel habilité."
          current="vehicules"
        />
        <div className="mt-8">
          <AdminAccessDenied code={access.denial.code} message={access.denial.message} />
        </div>
      </main>
    );
  }

  let options;
  try {
    options = await loadVehicleReferentialOptions();
  } catch {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <AdminHeader
          permissions={access.actor.permissions}
          title="Nouveau véhicule"
          subtitle="Le formulaire exige les référentiels actifs."
          current="vehicules"
          logout={<LogoutButton action={logoutAction} />}
        />
        <section role="alert" className="mt-8 rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
          <h2 className="text-lg font-semibold text-[#7a5310]">Référentiels indisponibles</h2>
          <p className="mt-2 text-sm text-[#7a5310]">
            Les marques, modèles et autres valeurs de référentiel n&apos;ont pas pu être chargés. Le formulaire de
            création n&apos;est pas affiché pour éviter une saisie incomplète.
          </p>
          <Link href="/admin/vehicules" className="mt-4 inline-block text-sm font-semibold text-[#0063DF] hover:text-[#0354A3]">
            Retour à la liste
          </Link>
        </section>
      </main>
    );
  }

  const noBrands = options.brands.length === 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <AdminHeader
        permissions={access.actor.permissions}
        title="Nouveau véhicule"
        subtitle="Le véhicule est créé en brouillon ; la publication est une action distincte."
        current="vehicules"
        logout={<LogoutButton action={logoutAction} />}
      />

      {noBrands ? (
        <section className="mt-8 rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
          <h2 className="text-lg font-semibold text-[#7a5310]">Référentiel incomplet</h2>
          <p className="mt-2 text-sm text-[#7a5310]">
            Aucune marque active n&apos;est enregistrée : la création d&apos;un véhicule sera refusée par le service tant
            que le référentiel n&apos;aura pas été complété par un gestionnaire de contenus.
          </p>
        </section>
      ) : null}

      <div className="mt-8">
        <VehicleForm mode="create" options={options} />
      </div>
    </main>
  );
}
