import Link from "next/link";

export default function NotFound() {
  return <main className="mx-auto max-w-3xl px-4 py-16"><h1 className="text-3xl font-bold text-[#011D4F]">Page introuvable</h1><Link className="mt-6 inline-block text-[#0063DF]" href="/">Retour à l’accueil</Link></main>;
}
