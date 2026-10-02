# Contrat — Lot 8 « Recette, sécurité, performance et préparation de production »

Référence : `dev.md` §11 (étape 8) et `docs/15_Roadmap_plan_developpement.docx` **L10**
(« Sécurité, SEO, performance, QA, lancement — gate : DoD global »).

Corpus faisant foi : doc 14 (cahier de tests et critères d'acceptation), doc 16 (CI/CD),
doc 17 (cahier de sécurité), doc 18 (SEO et performance), doc 20 (administration et exploitation),
doc 11 §9-§11 (sauvegardes, observabilité, politique de données).

Gel du lot avant exécution. Toute divergence entre ce document et le code est un défaut : le code
fait foi une fois vérifié, ce document doit alors être corrigé dans le même changement.

## 1. Périmètre

Le lot 8 **n'ajoute aucune fonctionnalité métier**. Il ferme la qualité, la sécurité, la performance
et la mise en production. Aucune règle produit n'est inventée ; **aucune donnée n'est modifiée**.

| Volet | Livrable |
|---|---|
| Sécurité HTTP | En-têtes CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, anti-clickjacking, `Permissions-Policy` |
| Recette sécurité | Script reproductible `scripts/verify-security.mjs` exécuté contre la base réelle (lecture seule) |
| Recette fonctionnelle | `docs/recette-lot-8.md` : chaque cas du doc 14 rattaché à une preuve exécutée |
| Performance / SEO | Contrôles sur le build réel, `robots.txt`, `sitemap.xml`, métadonnées, images |
| Préparation production | `docs/exploitation-production.md` : sauvegarde **vérifiée** (E30), fenêtre de changement, checklist de release (doc 16 §6), runbook d'incidents (doc 20 §10) |
| Rapport | `docs/rapport-lot-8.md` |

## 2. Décisions techniques (consignées en `docs/decisions.md` Partie A)

| # | Sujet | Décision | Raison |
|---|---|---|---|
| T50 | Origine des en-têtes | Les en-têtes sont posés par `headers()` de `next.config.ts` (module pur `lib/security/http-headers.ts`), **pas** par le middleware. | Ils couvrent alors aussi les pages prérendues, les fichiers statiques et les Route Handlers, sans travail à l'exécution. Le middleware reste dédié au rafraîchissement de session. |
| T51 | CSP et scripts | `script-src 'self' 'unsafe-inline'`, `'unsafe-eval'` **en développement uniquement**. Aucun `nonce` par requête. Seule l'origine Supabase configurée est autorisée : `https` pour `connect-src`, `img-src` et `media-src` ; `wss` **en plus** pour `connect-src` seul ; aucun joker. | Un `nonce` force le rendu dynamique de toutes les pages et dégrade la cible LCP du doc 18 §6. La restriction d'**origines** reste réelle : aucun script tiers n'est autorisé. Aucun outil d'analytics n'étant configuré, rien d'autre ne doit l'être. Limite assumée (§5). |
| T52 | HSTS | `max-age=63072000; includeSubDomains`, **production uniquement**, sans `preload`. | Annoncer HSTS depuis une prévisualisation épinglerait HTTPS sur un hôte qui ne le sert pas. `preload` sera ajouté avec le domaine Diaba Auto définitif, pas sur le sous-domaine `*.vercel.app` partagé. |
| T53 | Recette sécurité | `scripts/verify-security.mjs` (`npm run verify:security`) : tables privées via la clé publique, colonne `vehicles.reseller_price`, catalogue publié, bucket privé, bundle client, secrets suivis par git. Aucune écriture, aucun secret affiché. | Rend la recette du doc 14 §6 reproductible à chaque livraison. |
| T54 | Sauvegarde (E30) | Procédure écrite **et exercée** : export logique `pg_dump --schema-only` de la production restauré dans un PostgreSQL 17 local, inventaires comparés. | L'écart E30 exige une sauvegarde *vérifiée*. Aucune donnée métier n'est exportée (schéma seul) : aucune donnée personnelle ne quitte Supabase. |
| T55 | Fiche inexistante | **Soft-404 assumé** (`200` + `noindex`), cause et mitigation documentées. | Corriger le statut supposerait de retirer l'état de chargement de la route ou de rediriger ; le `noindex` empêche l'indexation. |
| T56 | Rate limiting | Limiteur **en mémoire, par instance**. Consigné comme limite connue, non corrigé dans ce lot. | Aucun stockage partagé (Redis/KV) n'est provisionné ni prescrit (D07) : c'est un choix d'infrastructure, donc un arbitrage. |
| T57 | Aucune donnée touchée | Le lot ne crée, ne modifie et ne supprime **aucune** donnée métier ; aucune migration n'est ajoutée. | Un lot de qualité ne doit pas changer l'état commercial. Les résidus signalés au lot 7 restent soumis à autorisation. |

## 3. Fichiers gelés

- `lib/security/http-headers.ts` (nouveau)
- `next.config.ts`
- `scripts/verify-security.mjs` (nouveau) + script `verify:security` de `package.json`
- `tests/unit/http-headers.test.ts` (nouveau)
- `docs/contrat-lot-8.md`, `docs/recette-lot-8.md`, `docs/exploitation-production.md`, `docs/rapport-lot-8.md`

Aucune modification de `services/`, `repositories/`, `app/` n'est attendue. Toute correction
découverte pendant la recette est consignée puis traitée avec sa propre justification.

## 4. Commandes de vérification

```bash
npx tsc --noEmit --incremental false
npx eslint .
npx vitest run
npm run verify:security
NODE_ENV=production npm run build
```

## 5. Limites assumées (à ne pas présenter comme résolues)

1. **CSP sans `nonce`** (T51) : `'unsafe-inline'` sur les scripts affaiblit la défense XSS. La
   restriction d'origines, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` et
   `frame-ancestors 'none'` restent effectifs.
2. **HSTS sans `preload`** (T52).
3. **Rate limiting en mémoire** (T56) : sur Vercel, le compteur est propre à chaque instance.
4. **Soft-404** sur une fiche inexistante (T55), neutralisé par `noindex`.
5. **Bucket `vehicle-images` public** (limite déjà documentée en M05 / D18) : un objet publié est
   lisible par son URL sans passer par RLS.
6. **Inscription et réinitialisation par e-mail inopérantes** tant que `mailer_autoconfirm` et un
   fournisseur SMTP ne sont pas configurés (reste à faire du lot 7, décision Diaba Auto).
7. **Locales EN et AR / RTL non livrées** (D29, arbitrage produit en attente).
8. **D03 / D21** (workflow d'approbation d'habilitation, liste canonique des permissions) restent des
   arbitrages produit en attente.