import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = { title: "Inscription — Diaba Auto" };

/* Aucune donnée personnelle n'est affichée : la page reste dynamique pour laisser le formulaire agir. */
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-[#011D4F]">Créer un compte</h1>
      <p className="mt-2 text-sm text-slate-600">
        L&apos;inscription donne accès à My Diaba Auto : suivi de vos demandes et de vos commandes.
      </p>

      <div className="mt-6">
        <RegisterForm />
      </div>

      <p className="mt-6 text-sm text-slate-600">
        Vous avez déjà un compte ?{" "}
        <Link href="/connexion" className="font-semibold text-[#0063DF] hover:text-[#0354A3]">
          Se connecter
        </Link>
      </p>
    </section>
  );
}
