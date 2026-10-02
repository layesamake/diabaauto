import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";

/**
 * Client Supabase **service_role**, strictement serveur.
 *
 * Usage : opérations d'administration d'identité (création d'un utilisateur Auth confirmé, lecture
 * des adresses e-mail, compensation). Les tables métier passent par Prisma ; ce client ne sert qu'à
 * l'API Auth d'administration, qu'aucune clé publique ne peut atteindre.
 *
 * Aucune valeur secrète n'est journalisée ni retournée : `isSupabaseAdminConfigured` ne renvoie qu'un
 * booléen, et le client est recréé à chaque appel (`persistSession: false`).
 */

export type SupabaseAdminConfig = {
  supabaseUrl: string | null;
  serviceRoleKey: string | null;
};

/** Lit la configuration sans jamais exposer la clé. */
export function readSupabaseAdminConfig(
  source: NodeJS.ProcessEnv = process.env,
): SupabaseAdminConfig {
  return {
    supabaseUrl: source.NEXT_PUBLIC_SUPABASE_URL?.trim() || source.SUPABASE_URL?.trim() || null,
    serviceRoleKey: source.SUPABASE_SERVICE_ROLE_KEY?.trim() || null,
  };
}

export function isSupabaseAdminConfigured(config: SupabaseAdminConfig): boolean {
  return Boolean(config.supabaseUrl && config.serviceRoleKey);
}

/**
 * Construit le client d'administration. Sans configuration complète, lève `INTERNAL` : le message
 * par défaut de `lib/errors.ts` ne révèle aucun détail d'infrastructure.
 */
export function createSupabaseAdminClient(
  config: SupabaseAdminConfig = readSupabaseAdminConfig(),
): SupabaseClient {
  if (!isSupabaseAdminConfigured(config) || !config.supabaseUrl || !config.serviceRoleKey) {
    throw new AppError("INTERNAL", "Administration d'identité non configurée.");
  }

  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
