import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { AFTER_LOGIN_PATH, internalPath, NEXT_PATH_PARAM } from "@/components/auth/auth-navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Route de callback Auth (confirmations d'e-mail, liens de réinitialisation, échanges PKCE).
 *
 * Aucune donnée n'est écrite ici : la session est ouverte par Supabase Auth, puis la navigation reprend
 * sur un chemin interne validé. Un lien invalide renvoie vers /connexion avec un message neutre qui ne
 * révèle pas l'existence d'un compte.
 */

export const dynamic = "force-dynamic";

function loginRedirect(request: NextRequest, code: string): NextResponse {
  const target = request.nextUrl.clone();
  target.pathname = "/connexion";
  target.search = `erreur=${encodeURIComponent(code)}`;
  return NextResponse.redirect(target);
}

function internalRedirect(request: NextRequest, path: string): NextResponse {
  const separator = path.indexOf("?");
  const target = request.nextUrl.clone();
  target.pathname = separator === -1 ? path : path.slice(0, separator);
  target.search = separator === -1 ? "" : path.slice(separator);
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  if (params.get("error") ?? params.get("error_code")) {
    return loginRedirect(request, "lien-invalide");
  }

  const requestedPath = params.get(NEXT_PATH_PARAM) ?? params.get("next");
  const destination = internalPath(requestedPath, AFTER_LOGIN_PATH);
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  if (!code && !(tokenHash && type)) {
    return loginRedirect(request, "lien-invalide");
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return loginRedirect(request, "indisponible");
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return loginRedirect(request, "lien-invalide");
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
    if (error) {
      return loginRedirect(request, "lien-invalide");
    }
  }

  return internalRedirect(request, destination);
}
