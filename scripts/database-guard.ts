/**
 * Garde d'environnement commune aux scripts d'amorçage Diaba Auto
 * (`prisma db seed`, `npm run staff:grant`, outils de migration).
 *
 * Exigences :
 * - doc 13 §« Procédure de livraison » : ne jamais viser la production par accident ;
 * - docs/decisions.md E25 : `APP_ENV` et `ALLOW_PRODUCTION_DATABASE` doivent être réellement
 *   exploités par le code, pas seulement déclarés dans `.env.example`.
 *
 * Aucun secret n'est journalisé : les messages ne nomment que la VARIABLE manquante, jamais sa valeur.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Charge `.env.local` puis `.env` (les valeurs déjà présentes dans `process.env` gagnent, comme dotenv).
 * Évite d'ajouter une dépendance tout en rendant les scripts utilisables sans export manuel.
 */
export function loadLocalEnv(cwd: string = process.cwd()): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(cwd, file);
    if (!existsSync(path)) continue;

    for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith("#")) continue;

      const separator = line.indexOf("=");
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim();
      if (key.length === 0 || process.env[key] !== undefined) continue;

      let value = line.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

/** Une variable d'environnement est renseignée si elle existe et n'est pas vide. */
function isNonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Refuse d'écrire dans une base de production, sauf autorisation explicite.
 * Lève une erreur (jamais un `process.exit` silencieux) pour que l'appelant décide.
 */
export function assertNonProductionDatabase(context: string): void {
  const appEnv = process.env.APP_ENV?.trim().toLowerCase();
  const allowProduction = process.env.ALLOW_PRODUCTION_DATABASE?.trim().toLowerCase() === "true";

  if (appEnv === "production" && !allowProduction) {
    throw new Error(
      `Refus d'exécuter ${context} : APP_ENV=production et ALLOW_PRODUCTION_DATABASE != "true". ` +
        `Définir explicitement ALLOW_PRODUCTION_DATABASE="true" pour confirmer (doc 13, décision E25).`,
    );
  }
}

/** Exige la présence d'une ou plusieurs variables d'environnement (valeurs jamais affichées). */
export function requireEnv(...names: string[]): void {
  const missing = names.filter((name) => !isNonEmpty(process.env[name]));
  if (missing.length > 0) {
    throw new Error(
      `Variables d'environnement manquantes : ${missing.join(", ")}. ` +
        `Renseigner ces variables dans l'environnement du serveur (voir .env.example).`,
    );
  }
}

/** Petit utilitaire d'affichage d'erreur cohérent pour les scripts CLI. */
export function fail(context: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${context}] ÉCHEC : ${message}`);
  process.exit(1);
}
