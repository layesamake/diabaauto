import type { Metadata } from "next";
import { createAdminMetadata, resolveAdminAccess } from "@/app/admin/guard";
import { logoutAction } from "@/app/my-diaba-auto/actions";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SiteSettingsForm } from "@/components/admin/SiteSettingsForm";
import { LogoutButton } from "@/components/profile/LogoutButton";
import type { StoredContact } from "@/lib/config/contact";
import { getSiteSettings } from "@/services/site-settings.service";

/**
 * Paramètres du site : coordonnées de contact affichées au public.
 *
 * Garde serveur `settings.manage` ; en cas de refus, AUCUNE donnée n'est lue. Une valeur laissée
 * vide retombe sur la configuration de l'environnement (puis, pour WhatsApp, sur la valeur documentée).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = createAdminMetadata(
  "Paramètres — Back-office Diaba Auto",
  "Coordonnées de contact affichées sur le site.",
);

export default async function AdminSettingsPage() {
  const access = await resolveAdminAccess("settings.manage");

  if (!access.granted) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <AdminHeader title="Paramètres" subtitle="Accès réservé aux administrateurs." />
        <div className="mt-8">
          <AdminAccessDenied code={access.denial.code} message={access.denial.message} />
        </div>
      </main>
    );
  }

  let settings: StoredContact | null = null;
  try {
    settings = await getSiteSettings(access.actor);
  } catch {
    settings = null;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <AdminHeader
        title="Paramètres"
        subtitle="Les coordonnées affichées sur le site. Un champ laissé vide retombe sur la configuration par défaut."
        logout={<LogoutButton action={logoutAction} />}
      />

      {settings ? (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
          <SiteSettingsForm initial={settings} />
        </section>
      ) : (
        <section role="alert" className="mt-8 rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
          <h2 className="text-lg font-semibold text-[#7a5310]">Paramètres momentanément indisponibles</h2>
          <p className="mt-2 text-sm text-[#7a5310]">
            Les paramètres n&apos;ont pas pu être chargés (la migration M11 est-elle appliquée ?). Aucune donnée
            n&apos;est modifiée.
          </p>
        </section>
      )}
    </main>
  );
}
