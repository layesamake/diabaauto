/**
 * Limitation de fréquence (docs/17_Cahier_securite.docx : « limitation de fréquence sur authentification,
 * inscription, récupération, demande et endpoints sensibles »).
 *
 * Les documents ne chiffrent AUCUN seuil : les valeurs par défaut ci-dessous sont donc des paramètres
 * provisoires, surchargeables par variables d'environnement (voir `docs/decisions.md` T08/D07).
 * Implémentation en mémoire (fenêtre fixe) : suffisante pour une instance, à remplacer par un stockage
 * partagé si plusieurs instances servent les mêmes routes sensibles.
 */
export type RateLimitRule = {
  limit: number;
  windowMs: number;
};

export type RateLimitRules = Record<string, RateLimitRule>;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

/** Seuils provisoires — à valider avec Diaba Auto (D07). */
export const defaultRateLimitRules = {
  authentication: { limit: 10, windowMs: 60_000 },
  registration: { limit: 5, windowMs: 60 * 60_000 },
  recovery: { limit: 5, windowMs: 60 * 60_000 },
  sensitive: { limit: 30, windowMs: 60_000 },
  // Ajout additif lot 4 (T36, contrat §2 Sous-agent C) : formulaire public sans authentification
  // (`/commander`), seuil provisoire identique à `registration`/`recovery` (même mécanisme, D07).
  customRequest: { limit: 5, windowMs: 60 * 60_000 },
} satisfies RateLimitRules;

export type RateLimiter = {
  check(ruleName: string, key: string): RateLimitResult;
  reset(ruleName?: string): void;
};

type Bucket = { count: number; expiresAt: number };

export function createRateLimiter(options?: {
  rules?: RateLimitRules;
  now?: () => number;
}): RateLimiter {
  const rules: RateLimitRules = options?.rules ?? defaultRateLimitRules;
  const now = options?.now ?? (() => Date.now());
  const buckets = new Map<string, Bucket>();

  return {
    check(ruleName: string, key: string): RateLimitResult {
      const rule = rules[ruleName];
      if (!rule) {
        throw new Error(`Unknown rate limit rule: ${ruleName}`);
      }

      const bucketKey = `${ruleName}:${key}`;
      const current = now();
      const bucket = buckets.get(bucketKey);

      if (!bucket || bucket.expiresAt <= current) {
        buckets.set(bucketKey, { count: 1, expiresAt: current + rule.windowMs });
        return { allowed: true, remaining: rule.limit - 1, retryAfterMs: 0 };
      }

      if (bucket.count >= rule.limit) {
        return { allowed: false, remaining: 0, retryAfterMs: bucket.expiresAt - current };
      }

      bucket.count += 1;
      return { allowed: true, remaining: rule.limit - bucket.count, retryAfterMs: 0 };
    },

    reset(ruleName?: string) {
      if (!ruleName) {
        buckets.clear();
        return;
      }

      for (const key of [...buckets.keys()]) {
        if (key.startsWith(`${ruleName}:`)) {
          buckets.delete(key);
        }
      }
    },
  };
}
