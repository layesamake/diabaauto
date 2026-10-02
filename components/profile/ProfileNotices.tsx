import Link from "next/link";

/**
 * États non nominaux de l'espace privé : compte suspendu (lecture seule), espace réservé aux clients,
 * ou visiteur sans session. Aucune donnée privée n'est affichée dans ces états.
 */

export function SuspendedAccountNotice({ children }: { children?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#f0dcae] bg-[#fdf6e6] p-5">
      <h2 className="text-lg font-semibold text-[#7a5310]">Compte en lecture seule</h2>
      <p className="mt-2 text-sm text-[#7a5310]">
        Ce compte est suspendu. Les informations personnelles ne peuvent pas être affichées ni modifiées
        tant que la situation n&apos;a pas été régularisée par Diaba Auto.
      </p>
      {children}
    </section>
  );
}

export function StaffAreaNotice() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-[#011D4F]">Espace réservé aux comptes clients</h2>
      <p className="mt-2 text-sm text-slate-600">
        Votre session appartient au personnel Diaba Auto. Les informations de cet espace concernent les
        comptes clients et ne sont pas affichées ici.
      </p>
      <Link href="/admin" className="mt-4 inline-block text-sm font-semibold text-[#0063DF] hover:text-[#0354A3]">
        Accéder au back-office
      </Link>
    </section>
  );
}

export function ProfileUnavailableNotice() {
  return (
    <section className="rounded-xl border border-[#f3cfcb] bg-[#fdf1f1] p-5" role="alert">
      <h2 className="text-lg font-semibold text-[#95312a]">Profil indisponible</h2>
      <p className="mt-2 text-sm text-[#95312a]">
        Le profil associé à ce compte n&apos;a pas pu être chargé. Aucune donnée personnelle n&apos;est affichée
        tant que la situation n&apos;est pas rétablie. Réessayez plus tard ou contactez Diaba Auto.
      </p>
    </section>
  );
}
