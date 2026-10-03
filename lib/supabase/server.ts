import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client Supabase côté serveur (cookies de session via `next/headers`).
 * Supabase Auth est la seule source d'identité : aucun mot de passe n'est stocké dans les tables métier
 * (docs/11_Specifications_Supabase_Auth_RLS_Storage.docx).
 */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Appelé depuis un Server Component en lecture seule : le rafraîchissement de session
          // est assuré par le middleware (lib/supabase/middleware.ts).
        }
      },
    },
  });
}

/**
 * Identité Auth vérifiée côté serveur. `getUser()` valide le jeton auprès de Supabase :
 * ne jamais se fier à un identifiant envoyé par le navigateur (CLAUDE.md §5).
 */
export async function getVerifiedAuthUser(): Promise<{ id: string; email: string | null } | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }

  return { id: data.user.id, email: data.user.email ?? null };
}
