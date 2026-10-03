import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Toutes les routes sauf celles qui n'ont aucune session à rafraîchir.
     *
     * `updateSession` appelle `supabase.auth.getUser()`, qui part sur le réseau vers Supabase Auth
     * dès qu'un cookie de session existe. Toute route exclue ici économise donc un aller-retour par
     * requête pour les utilisateurs connectés.
     *
     * - `_next/static`, `_next/image`, `brand`, les icônes, `favicon.ico`, `robots.txt`,
     *   `sitemap.xml` : ressources statiques.
     * - `api/media` : livraison des images du catalogue, appelée une fois PAR IMAGE. La route est
     *   publique et ne lit jamais la session : elle vérifie elle-même, dans sa requête SQL, que le
     *   média est public et que la fiche est publiée (`repositories/public-media.repository.ts`).
     *   Sans cette exclusion, une fiche à cinq photos déclenchait cinq appels d'authentification.
     * - `api/health` : sonde de disponibilité, sans session ni données.
     *
     * N'exclure ici qu'une route réellement publique : les routes privées sont protégées par ce
     * middleware (`privateRoutes`) ET par les gardes serveur de `services/access.service.ts`.
     *
     * Chaque exclusion est bornée (`api/media/`, `api/health` non suivi d'un mot) : sans cela, une
     * future route au nom simplement préfixé — `/api/media-admin` — sortirait du middleware sans
     * que personne ne l'ait voulu. `tests/unit/middleware-matcher.test.ts` verrouille ces limites.
     */
    "/((?!_next/static|_next/image|api/media/|api/health(?![\\w-])|brand/|favicon\\.ico|icon\\.png|apple-icon\\.png|robots\\.txt|sitemap\\.xml).*)",
  ],
};
