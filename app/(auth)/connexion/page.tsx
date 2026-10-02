import type { Metadata } from "next";
import Link from "next/link";
import {
  AFTER_LOGIN_PATH,
  authErrorMessage,
  internalPath,
  NEXT_PATH_PARAM,
  textParam,
} from "@/components/auth/auth-navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { StatusMessage } from "@/components/auth/StatusMessage";

export const metadata: Metadata = { title: "Connexion — Diaba Auto" };

/* Les paramètres d'URL dépendent de la requête : aucun rendu statique n'est possible. */
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

/** Rappel du contexte de la redirection, sans jamais nommer de ressource privée d'un tiers. */
function contextMessage(nextPath: string): string {
  if (nextPath.startsWith("/admin")) {
    return "Connexion requise pour accéder au back-office Diaba Auto.";
  }

  if (nextPath !== AFTER_LOGIN_PATH) {
    return "Connexion requise pour accéder à cette page.";
  }

  return "";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const nextPath = internalPath(textParam(params[NEXT_PATH_PARAM]), AFTER_LOGIN_PATH);
  const serverError = authErrorMessage(textParam(params.erreur));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-[#011D4F]">Connexion</h1>
      <p className="mt-2 text-sm text-slate-600">
        Accédez à votre espace My Diaba Auto avec l&apos;adresse e-mail et le mot de passe utilisés à
        l&apos;inscription.
      </p>

      <div className="mt-4">
        <StatusMessage tone="info" message={contextMessage(nextPath)} />
      </div>

      <div className="mt-6">
        <LoginForm nextPath={nextPath} initialError={serverError} />
      </div>

      <div className="mt-6 flex flex-col gap-2 text-sm text-slate-600">
        <p>
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="font-semibold text-[#0063DF] hover:text-[#0354A3]">
            Créer un compte
          </Link>
        </p>
        <p>
          <Link href="/recuperation" className="font-semibold text-[#0063DF] hover:text-[#0354A3]">
            Mot de passe oublié ?
          </Link>
        </p>
      </div>
    </section>
  );
}
