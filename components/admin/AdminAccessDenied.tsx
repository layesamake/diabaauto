import Link from "next/link";

/**
 * Refus d'accès neutre du back-office.
 *
 * Le message provient de l'enveloppe normalisée (`lib/errors.ts`) et ne révèle ni ressource privée,
 * ni identifiant, ni détail interne. Aucune donnée du back-office n'est rendue avec ce composant.
 */
export function AdminAccessDenied({ code, message }: { code: string; message: string }) {
  return (
    <section role="alert" className="rounded-xl border border-[#f3cfcb] bg-[#fdf1f1] p-5">
      <h2 className="text-lg font-semibold text-[#95312a]">
        {code === "UNAUTHENTICATED" ? "Connexion requise" : "Accès refusé"}
      </h2>
      <p className="mt-2 text-sm text-[#95312a]">{message}</p>
      <p className="mt-2 text-sm text-[#95312a]">Aucune donnée du back-office n&apos;est affichée pour ce compte.</p>
      <div className="mt-4 flex flex-wrap gap-4">
        {code === "UNAUTHENTICATED" ? (
          <Link
            href="/connexion?suivant=%2Fadmin"
            className="rounded-lg bg-[#0063DF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0354A3]"
          >
            Se connecter
          </Link>
        ) : null}
        <Link href="/" className="text-sm font-semibold text-[#0063DF] hover:text-[#0354A3]">
          Retour au site public
        </Link>
      </div>
    </section>
  );
}

/** Écran introuvable du back-office : message neutre, aucune donnée d'une éventuelle ressource. */
export function AdminNotFound({ label }: { label: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-[#011D4F]">{label}</h2>
      <p className="mt-2 text-sm text-slate-600">
        Cette ressource n&apos;existe pas ou n&apos;est pas accessible. Aucune donnée n&apos;est affichée.
      </p>
      <Link
        href="/admin/vehicules"
        className="mt-4 inline-block text-sm font-semibold text-[#0063DF] hover:text-[#0354A3]"
      >
        Retour à la liste des véhicules
      </Link>
    </section>
  );
}
