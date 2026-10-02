import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";

export const metadata: Metadata = { title: "Déconnexion — Diaba Auto" };

export const dynamic = "force-dynamic";

export default function SignOutPage() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-[#011D4F]">Déconnexion</h1>
      <p className="mt-2 text-sm text-slate-600">
        La déconnexion ferme la session Diaba Auto sur cet appareil. Vous pourrez vous reconnecter à tout
        moment.
      </p>

      <div className="mt-6">
        <SignOutButton />
      </div>

      <p className="mt-6 text-sm text-slate-600">
        <Link href="/my-diaba-auto" className="font-semibold text-[#0063DF] hover:text-[#0354A3]">
          Revenir à My Diaba Auto
        </Link>
      </p>
    </section>
  );
}
