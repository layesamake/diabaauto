/** État de chargement de l'écran « Personnel » : aucune donnée n'est affichée avant la garde d'accès. */
export default function AdminStaffLoading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10" aria-busy="true" aria-live="polite">
      <h1 className="text-3xl font-bold text-[#011D4F]">Personnel</h1>
      <p className="mt-2 text-slate-600">Vérification de vos habilitations…</p>
      <div className="mt-8 h-32 animate-pulse rounded-xl border border-slate-200 bg-[#f4f7fb]" />
    </main>
  );
}
