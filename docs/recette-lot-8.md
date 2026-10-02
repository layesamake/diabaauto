# Recette du lot 8 — critères d'acceptation du corpus

Référence : `docs/14_Cahier_tests_criteres_acceptation.docx` (§2 à §8) et `docs/17_Cahier_securite.docx`.
Chaque ligne porte une **preuve exécutée** : fichier de test, commande, ou observation datée.
Ce qui n'a pas été exécuté est écrit comme tel (§10).

Environnement des preuves du 2 octobre 2026 :

| Élément | Valeur |
|---|---|
| Base de données | projet Supabase de production `bxmsxmxwdwpzqcxfdjeu` (lecture seule pour cette recette) |
| Application déployée | https://diabaauto.vercel.app (production Vercel) |
| Serveur local | `npm start` sur `http://localhost:3100` (build de production) |
| Runtime | Node 22, Next.js 15.5.26, React 18.3.1, Prisma 6.12.0 |

## 1. Niveaux de test (doc 14 §1)

| Niveau | État | Preuve |
|---|---|---|
| Unitaires | Réalisé | `npx vitest run` → **499 tests / 42 fichiers, tous verts** |
| Intégration (Prisma/Supabase, transactions, RLS, Storage) | Réalisé | `npm run verify:security`, essai de restauration (§7), scripts de lots 6 et 7 |
| E2E (parcours public) | Réalisé | Parcours navigateur du §6 sur le déploiement de production |
| Sécurité (RBAC, RLS, API directe, uploads, rate limit) | Réalisé | §5 |
| Performance (catalogue, images, requêtes) | Partiellement réalisé | §8 |
| Responsive / i18n | Réalisé pour le responsive ; **i18n FR seulement** | §9 — décision D29 en attente |

## 2. Critères — prix (doc 14 §2)

| ID | Attendu | Résultat | Preuve |
|---|---|---|---|
| T-PRICE-01 | Visiteur → prix Standard seulement | Conforme | `tests/unit/pricing.service.test.ts` (« returns standard price for visitors and standard customers ») ; `tests/unit/vehicle-price.test.ts` (11 cas) |
| T-PRICE-02 | Standard connecté → prix Standard | Conforme | idem |
| T-PRICE-03 | Revendeur `PENDING` → prix Standard | Conforme | `tests/unit/catalogue.service.test.ts`, `tests/unit/vehicle-price.test.ts` |
| T-PRICE-04 | Revendeur `APPROVED` actif → tarif Revendeur + label | Conforme | `tests/unit/pricing.service.test.ts` (« returns reseller price only for approved active resellers ») |
| T-PRICE-05 | Appel API direct par un Standard → **aucun** prix Revendeur | Conforme, vérifié sur la base réelle | `npm run verify:security` contrôle 2 : `vehicles.reseller_price` → **HTTP 400 (permission denied)** avec la clé publique |
| T-PRICE-06 | Tarif Revendeur absent → repli Standard + anomalie | Conforme | `tests/unit/pricing.service.test.ts` (« falls back to standard price when reseller price is missing ») |

Contrôle complémentaire exécuté : la fiche publique rendue par la production n'expose que le prix
Standard (`6 250 000 XOF`) et **aucun** champ fournisseur ou marge ; le JSON-LD `Vehicle` ne porte
que `offers` public.

## 3. Critères — véhicule (doc 14 §3)

| ID | Attendu | Résultat | Preuve |
|---|---|---|---|
| T-VEH-01 | Publication incomplète bloquée + liste des champs | Conforme | `tests/unit/vehicle.service.test.ts` (13 cas) |
| T-VEH-02 | Passage `SOLD` → retiré des disponibles, historique conservé | Conforme | `tests/unit/catalogue.service.test.ts`, `tests/unit/transitions.service.test.ts` (14 cas) |
| T-VEH-03 | Véhicule favori vendu → favori conservé, état `SOLD` visible | Conforme | `tests/unit/favorite.service.test.ts` (12 cas) |
| T-VEH-04 | Éligibilité à l'import signalée explicitement | Conforme | Badge « Éligibilité non vérifiée » observé sur la fiche de production ; `tests/unit/catalogue.service.test.ts` |
| T-VEH-05 | Vidéo lue sans bloquer la page | Non applicable en V1 | Aucun média vidéo amorcé (`VehicleMedia.mediaType = VIDEO` modélisé mais non utilisé) |

## 4. Critères — My Diaba Auto (doc 14 §4)

| Cas | Résultat | Preuve |
|---|---|---|
| Inscription Standard, session, favori, déconnexion/reconnexion, favori conservé | Conforme | `tests/unit/identity.service.test.ts`, `tests/unit/favorite.service.test.ts`, `tests/unit/saved-search.service.test.ts` |
| Migration des favoris locaux à la connexion, idempotente | Conforme | `tests/unit/favorite.service.test.ts`, `tests/unit/local-store.test.ts` |
| Demande Revendeur → approbation → tarif recalculé | Conforme | `tests/unit/reseller-application.service.test.ts` (17 cas) ; scénario base réelle du lot 5 |
| Un client ne peut pas atteindre les données d'un autre (IDOR) | Conforme | `tests/unit/access.service.test.ts` (6 cas), `tests/unit/permissions.service.test.ts`, `tests/unit/customer.repository.test.ts` |
| Espace privé fermé au visiteur | Conforme, observé | `GET /my-diaba-auto` → **307 vers `/connexion?suivant=%2Fmy-diaba-auto`** |

## 5. Critères — réservation et commande (doc 14 §5)

| Cas | Résultat | Preuve |
|---|---|---|
| Double clic réservation → une seule réservation | Conforme | `tests/unit/reservation.service.test.ts` (26 cas), `tests/unit/reservation-reference.test.ts` |
| Acompte externe : preuve enregistrée, aucun paiement créé | Conforme | `tests/unit/reservation.service.test.ts` ; aucun module de paiement n'existe (hors périmètre V1) |
| Deux commandes concurrentes sur le même véhicule → conflit | Conforme | `tests/unit/order.service.test.ts` (34 cas), `tests/unit/transitions.service.test.ts` ; contraintes SQL de M08 |
| Vente transactionnelle : commande + véhicule `SOLD` + audit | Conforme | `tests/unit/order.service.test.ts`, `tests/unit/audit.service.test.ts` ; scénario base réelle du lot 6 |
| Prix figé dans la commande | Conforme | `tests/unit/order.service.test.ts` |

## 6. RLS et sécurité (doc 14 §6, doc 17)

Commande : `npm run verify:security` — lecture seule, exécutée contre la base de production.

| Contrôle | Attendu | Résultat |
|---|---|---|
| Tables privées accessibles avec la clé publique | Refus | **28 tables / 28 refusées** (HTTP 401-403), dont `audit_logs`, `profiles`, `staff_profiles`, `leads`, `orders`, `reservations`, `vehicle_prices`, `price_history`, `vehicle_documents`, `_prisma_migrations` — 0 ligne exposée |
| Colonne `vehicles.reseller_price` | Inaccessible au navigateur | **HTTP 400** (permission denied for column) |
| Catalogue anonyme | Uniquement des fiches publiées | 4 véhicules servis, `is_published = true` pour tous |
| Bucket privé `vehicle-documents` | Non listable anonymement | Liste vide avec la clé publique |
| Clé `service_role` et `DATABASE_URL` dans le bundle client | Absentes | **Absentes** de 60 fichiers de `.next/static` |
| Secrets dans les fichiers suivis par git | Aucun ; `.env.local` ignoré | **Aucun** secret dans 323 fichiers suivis ; `.env.local` ignoré par git |
| Routes d'administration | Fermées au visiteur | `GET /admin` et `GET /admin/personnel` → **307 vers `/connexion?suivant=…`** |

Le contrôle de la **clé publique** est celui que le document 14 §6 exige (« anon key »). Les mêmes
tables avaient déjà été éprouvées avec des acteurs réels (anon / authenticated / staff) sur base
réelle au lot 6 (`e2e-lot6-rls.sh`).

## 7. Sauvegarde et restauration (écart E30, doc 11 §9, doc 20 §11)

Procédure écrite **et exercée** le 2 octobre 2026 :

| Étape | Résultat |
|---|---|
| Export logique du schéma de production (`pg_dump --schema-only --schema=public`) | 2 639 lignes exportées sans erreur |
| Restauration dans un PostgreSQL 17 local neuf (stub d'environnement Supabase : rôles `anon`/`authenticated`/`service_role`, schémas `auth` et `storage`) | Restauration **sans erreur** |
| Comparaison des inventaires production / base restaurée | **Identiques** : 39 tables, 311 colonnes, 104 index, 106 contraintes, 16 policies, 6 fonctions, 38 tables sous RLS |
| Liste des tables | **Identique** (39 tables) |
| Base d'essai supprimée | Fait |

Aucune donnée métier n'a quitté Supabase : l'export est **schéma seul** (`--schema-only`).

## 8. Performance et SEO (doc 18)

| Cible | Résultat | Preuve |
|---|---|---|
| Build de production | Vert | `NODE_ENV=production npm run build` |
| Poids des pages publiques | Accueil, `À propos`, `Comment ça marche`, `Contact` **prérendues statiques** ; catalogue et fiches dynamiques (données de prix personnalisées) | Sortie de build ; `First Load JS` partagé : 103 kB |
| Index de base | Index partiel catalogue `WHERE is_published = true` (T06) ; 104 index au total | `scripts/verify-migrations.mjs`, inventaire de restauration |
| `robots.txt` | Zones privées fermées (`/admin`, `/my-diaba-auto`, `/api`, `/auth`), sitemap absolu | `https://diabaauto.vercel.app/robots.txt` |
| `sitemap.xml` | Pages publiques + fiches publiées uniquement, URL absolues de production | `https://diabaauto.vercel.app/sitemap.xml` |
| Métadonnées de fiche | Titre unique, description, `canonical`, Open Graph, JSON-LD `Vehicle` sans champ fournisseur | Fiche de production du §9 |
| Images | Logo servi par `next/image` (variantes, `priority`) ; aucun média véhicule amorcé | Fiche de production |
| Mesure Core Web Vitals (LCP/CLS/INP) | **Non mesurée** : aucune sonde de terrain (CrUX/RUM) n'est installée | À instrumenter (doc 18 §9) |

## 9. UX, responsive et accessibilité (doc 14 §7)

Parcours exécuté dans un navigateur réel sur le déploiement de production.

| Contrôle | Résultat |
|---|---|
| Accueil en 360 px | Aucun débordement horizontal (`scrollWidth = 360 = innerWidth`) |
| Catalogue en 360 px | Aucun débordement ; filtres empilés lisibles |
| Fiche véhicule en 390 px | Aucun débordement ; prix lisible, CTA WhatsApp présent |
| Alternatives textuelles des images | Logo `alt="Diaba Auto"` ; galerie sans image → bloc `role="img"` + `aria-label="Photo à venir"` |
| CTA WhatsApp | Lien `wa.me` avec message pré-rempli (titre, référence, **prix public**, lien de la fiche) |
| Libellés et navigation | `nav aria-label`, `footer`, titres hiérarchisés (`h1` unique par page) |
| Arabe / RTL, FR / EN | **Non applicable en l'état** : le site est livré **en français seulement** (décision D29 en attente d'arbitrage produit : fourniture des traductions relues et stratégie de routage). Tous les textes sont centralisés dans `lib/i18n/` pour que l'ajout ne demande aucune réécriture |

### Constat mesuré — statut HTTP d'une fiche inexistante

`GET /voitures/<slug-inexistant>` répond **HTTP 200** alors que la page affichée est bien la page
« introuvable » de l'application. Cause : la route est en rendu diffusé (`force-dynamic` +
`loading.tsx`), donc l'en-tête de statut part avant l'appel à `notFound()`.
**Mitigation en place** : une fiche inexistante porte `<meta name="robots" content="noindex"/>`, donc
aucune indexation. Le statut reste un **soft-404** ; le corriger supposerait de retirer l'état de
chargement de la route (régression UX) ou de passer par une redirection. Consigné, non corrigé.

## 10. Definition of Done (doc 14 §8)

| Exigence | État |
|---|---|
| Lint, typecheck, tests unitaires et build réussissent | **Fait** — `tsc` 0 erreur, `eslint` 0 erreur, 499 tests verts, build vert |
| Tests E2E critiques passent | **Fait** pour le parcours public et les contrôles d'accès ; parcours authentifiés couverts par les tests de service et les scénarios base réelle des lots 5 à 7 |
| Preview Vercel validée | **Fait** — la production Git-connectée est déployée à chaque fusion sur `main` ; la recette du §9 a été menée sur ce déploiement |
| Migration testée | **Fait** — `node scripts/verify-migrations.mjs` (`ÉCART = 0`), inventaire de la base réelle au §7 |
| Aucun secret exposé | **Fait** — §6, contrôles 5 et 6 |
| Accessibilité et responsive vérifiés | **Fait pour le responsive et les repères ARIA de base** ; aucun audit d'accessibilité outillé (Lighthouse/axe) n'a été exécuté |
| Documentation mise à jour | **Fait** — `docs/contrat-lot-8.md`, `docs/recette-lot-8.md`, `docs/exploitation-production.md`, `docs/rapport-lot-8.md`, `docs/decisions.md` |

## 11. Ce qui n'a **pas** été exécuté (et pourquoi)

| # | Point | Raison |
|---|---|---|
| 1 | Soumission d'un formulaire public (`/commander`, contact, inscription) depuis la recette | Écrirait une donnée réelle en production. Les parcours d'écriture ont été exercés sur base réelle aux lots 4 à 7 avec nettoyage, et sont couverts par les tests de service |
| 2 | Parcours back-office authentifié dans un navigateur | Aucun identifiant n'est enregistré dans le coffre de ce poste et aucun mot de passe n'est saisi par l'agent. L'interface d'administration a été vérifiée au lot 7 (liste, modification, désactivation, audit) |
| 3 | Test de charge et mesure des Core Web Vitals | Aucun outil de mesure (RUM/CrUX, k6) n'est installé ni prescrit par le corpus |
| 4 | Test d'intrusion / scan de vulnérabilités | Hors du périmètre d'un lot de développement ; non prescrit par le doc 17 |
| 5 | Basculement `mailer_autoconfirm` et SMTP | Hors périmètre technique : le jeton d'accès ne porte pas `auth_config_write` ; décision Diaba Auto |
| 6 | Purge des résidus `customer_profiles` et du compte de test | Écriture en production — soumise à autorisation explicite (reste à faire du lot 7, §5) |
| 7 | Locales EN et AR, RTL | Aucune traduction relue disponible (D29) |