import type { Metadata } from "next";
import Link from "next/link";
import { RecoveryRequestForm } from "@/components/auth/RecoveryRequestForm";

export const metadata: Metadata = { title: "Récupération de compte — Diaba Auto" };

export const dynamic = "force-dynamic";

export default function RecoveryPage() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-[#011D4F]">Récupération de compte</h1>
      <p className="mt-2 text-sm text-slate-600">
        Indiquez l&apos;adresse e-mail de votre compte : si elle correspond à un compte, un lien de
        réinitialisation est envoyé. Aucune confirmation n&apos;est donnée sur l&apos;existence du compte.
      </p>

      <div className="mt-6">
        <RecoveryRequestForm />
      </div>

      <p className="mt-6 text-sm text-slate-600">
        <Link href="/connexion" className="font-semibold text-[#0063DF] hover:text-[#0354A3]">
          Revenir à la connexion
        </Link>
      </p>
    </section>
  );
}
