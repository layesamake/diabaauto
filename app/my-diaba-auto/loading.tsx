/**
 * État de chargement de My Diaba Auto.
 * Volontairement dépourvu de toute donnée : il est visible avant que la session et le profil
 * n'aient été résolus.
 */
export default function MyDiabaAutoLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10" aria-busy="true" aria-live="polite">
      <h1 className="text-3xl font-bold text-[#011D4F]">My Diaba Auto</h1>
      <p className="mt-2 text-slate-600">Chargement de votre espace…</p>
      <div className="mt-8 grid gap-6">
        {[0, 1].map((index) => (
          <div key={index} className="h-32 animate-pulse rounded-xl border border-slate-200 bg-[#f4f7fb]" />
        ))}
      </div>
    </main>
  );
}
