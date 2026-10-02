"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-3xl px-4 py-16"><h1 className="text-3xl font-bold text-[#011D4F]">Une erreur est survenue</h1><button className="mt-6 rounded bg-[#0063DF] px-4 py-2 text-white" onClick={reset}>Réessayer</button></main>;
}
