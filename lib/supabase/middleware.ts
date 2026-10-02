import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { privateRoutes } from "@/lib/routes";

/**
 * Rafraîchissement de session et protection des routes privées (doc 17 : « sessions Supabase vérifiées
 * côté serveur ; cookies et redirections configurés de façon sûre »).
 *
 * Une protection de route ne suffit PAS pour les Server Actions et les API : les gardes serveur
 * (`services/access.service.ts`) restent obligatoires dans chaque action.
 */
export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPrivate = privateRoutes.some(
    (route) => request.nextUrl.pathname === route || request.nextUrl.pathname.startsWith(`${route}/`),
  );

  if (isPrivate && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/connexion";
    redirectUrl.search = `?suivant=${encodeURIComponent(request.nextUrl.pathname)}`;
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
