import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Toutes les routes sauf les ressources statiques et les images optimisées,
     * afin de rafraîchir la session sans coût inutile.
     */
    "/((?!_next/static|_next/image|brand|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
