import type { Metadata } from "next";
import Link from "next/link";
import { PasswordResetForm } from "@/components/auth/PasswordResetForm";

export const metadata: Metadata = { title: "Nouveau mot de passe — Diaba Auto" };

export const dynamic = "force-dynamic";

export default function PasswordResetPage() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-[#011D4F]">Nouveau mot de passe</h1>
      <p className="mt-2 text-sm text-slate-600">
        Cette page n&apos;est accessible qu&apos;avec le lien reçu par e-mail. Le lien est vérifié côté serveur
        avant tout enregistrement.
      </p>

      <div className="mt-6">
        <PasswordResetForm />
      </div>

      <p className="mt-6 text-sm text-slate-600">
        <Link href="/connexion" className="font-semibold text-[#0063DF] hover:text-[#0354A3]">
          Revenir à la connexion
        </Link>
      </p>
    </section>
  );
}
