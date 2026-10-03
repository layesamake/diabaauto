# Rapport de lot — « Référentiels, véhicules et catalogue public »

> Lot nommé « lot 3 » par `CLAUDE.md` §11 (« Référentiels, véhicules et catalogue public ») et « Lot 2 » par `docs/15_Roadmap_plan_developpement.docx` (décision D16 : le contenu prime sur le numéro).
> Date du rapport : 2026-09-29. Dépôt : `/opt/data/projects/diabacar`. Commit du lot : `75ea72d`.
> Exécution : un agent orchestrateur a figé les interfaces dans un contrat de lot, puis trois sous-agents
> ont travaillé en parallèle sur des périmètres de fichiers disjoints (service/repository catalogue,
> interfaces publiques, SEO/WhatsApp). Le commit, l'intégration et toutes les vérifications ci-dessous
> ont été réalisés par l'orchestrateur **après** la fin des sous-agents ; deux corrections d'intégration
> ont été apportées par lui (voir §3.3).

## 1. Fonctionnalités désormais utilisables

- **Back-office — référentiels** : `/admin/referentiels` — consultation, création, modification, activation/désactivation des marques, modèles, carrosseries, énergies, boîtes et couleurs (codes normalisés, garde `content.manage`).
- **Back-office — véhicules** : `/admin/vehicules` (liste filtrable et paginée), `/admin/vehicules/nouveau` (création, référence `DBC-YYYY-NNNNNN` générée côté serveur), `/admin/vehicules/[id]` (fiche : champs structurants, panneau de prix, panneau de statut commercial, médias). Publication soumise à l'invariant T22.
- **Catalogue public** (`/voitures`) : recherche plein texte sur le titre et la référence, filtres marque / modèle / carrosserie / énergie / boîte / état / localisation / année min-max / disponibilité, tri (récent, prix croissant/décroissant, année, kilométrage), grille de cartes, **pagination serveur**, compteur de résultats, état vide avec appel à l'action, état d'indisponibilité géré.
- **Fiche véhicule publique** (`/voitures/[slug]`) : galerie photo/vidéo, titre / année / référence, badges (dont « Réservé » et « Vendu »), **prix véhicule et transport sur deux lignes distinctes** avec total indicatif seulement si le transport existe, CTA WhatsApp et partage, résumé technique, éligibilité import Sénégal, « rapport d'inspection disponible sur demande », véhicules similaires.
- **Page marque** (`/marque/[brand]`) : en-tête de marque et catalogue filtré, composants du catalogue réutilisés.
- **Accueil** (`/`) : hero, recherche rapide redirigeant vers `/voitures?search=…`, nouveautés, blocs Chine/Sénégal, processus, bloc Revendeur.
- **SEO** : métadonnées de fiche (titre, description, canonical, Open Graph avec image principale), métadonnées de catalogue (`noindex` au-delà de la page 1), JSON-LD `Vehicle`/`Product` conditionnel, `/robots.txt`, `/sitemap.xml`.
- **Internationalisation** : tous les textes du catalogue public sont centralisés dans `lib/i18n/` (français uniquement — D29).
- **WhatsApp** : lien `wa.me` construit côté serveur, message contenant nom, référence et lien du véhicule (BR-121), jamais présenté comme un devis (BR-123), numéro issu de la configuration (BR-120).

## 2. Données et configuration

- **Schéma** : inchangé par ce lot dans sa structure (16 enums, 33 tables, 237 colonnes, 39 clés étrangères). M02 a été ajustée pendant le lot ; `scripts/verify-migrations.mjs` conclut **ÉCART = 0** (M01–M04 couvrent le schéma : 151 instructions ; M05 : 85 instructions de RLS/Storage). Aucune migration n'a été appliquée : aucune base n'est accessible (D15).
- **Client Prisma** régénéré (`npx prisma generate`) : le client généré était périmé et ignorait `eligibility_status`, présent au schéma depuis l'alignement canonique. Sans régénération, la sélection publique ne compilait pas.
- **Contrat de prix étendu (additif)** : `ResolvedPrice` porte désormais `transportAmount`, alimenté par la ligne de prix retenue. Les règles Standard/Revendeur sont inchangées ; les assertions d'égalité stricte de `tests/unit/pricing.service.test.ts` et `tests/unit/vehicle-price.test.ts` ont été mises à jour en conséquence.
- **Variables d'environnement** : `.env.example` gagne `NEXT_PUBLIC_WHATSAPP_NUMBER`, dont la valeur par défaut est la valeur initiale explicitement documentée par BR-120 (+221 78 225 40 40). `NEXT_PUBLIC_APP_URL` reste la base des URL absolues (canonical, Open Graph, sitemap, robots) : elle **doit** être renseignée en préproduction et en production.
- **Décisions** : `docs/decisions.md` porte 7 décisions techniques (T23–T29) et 7 arbitrages produit en attente (D26–D32), dont le détail des conséquences est explicité.

## 3. Vérifications réellement exécutées

### 3.1 Contrôles automatisés (exécutés par l'orchestrateur après la fin des sous-agents)

| Contrôle | Commande | Résultat |
| --- | --- | --- |
| Typage | `npx tsc --noEmit` | **OK**, 0 erreur |
| Qualité | `npx eslint .` | **OK**, 0 erreur |
| Tests | `npx vitest run` | **22 fichiers, 210 tests, tous verts** (lot 2 : 14 fichiers / 88 tests) |
| Build | `npm run build` | **compilation réussie**, 28 routes ; `/`, `/voitures`, `/voitures/[slug]`, `/marque/[brand]` en dynamique ; `/robots.txt` et `/sitemap.xml` générés |
| Cohérence migrations ↔ schéma | `node scripts/verify-migrations.mjs` | **ÉCART = 0** |

### 3.2 Routes réellement servies (build de production, port 4311)

Serveur `npm run start` démarré pour de vrai, puis sondé avec `curl`. **Journal serveur : aucune erreur non gérée.**

| Route | Code |
| --- | --- |
| `/` | 200 |
| `/voitures` | 200 |
| `/voitures?condition=FOO` | 200 (écran « filtres invalides » géré, pas de trace serveur) |
| `/marque/byd` | 200 |
| `/voitures/inconnu` | **200** — voir §4.1 : sans base, le service lève au lieu de retourner `null`, `notFound()` n'est donc pas atteignable ici |
| `/robots.txt` | 200 (`Allow: /` ; `Disallow: /admin`, `/my-diaba-auto`, `/api`, `/auth` ; sitemap absolu) |
| `/sitemap.xml` | 200 (pages publiques de `lib/routes.ts`, tolérant à l'absence de base) |
| `/admin`, `/my-diaba-auto` | 200 (comportement du lot 2 conservé, `noindex`) |

Aucune occurrence de `supplier`, `source_url`, `sourceUrl`, `marge` ou `reseller` dans le HTML servi. **Cette sonde ne prouve pas grand-chose à elle seule** : aucun véhicule n'étant rendu (base absente), la garantie « aucun champ d'approvisionnement » repose sur les tests unitaires de projection (§3.3), pas sur ce rendu.

### 3.3 Relecture et corrections d'intégration (orchestrateur)

- Relecture ligne à ligne de `services/catalogue.service.ts` et `repositories/catalogue.repository.ts` : sélections explicites **sans** `SENSITIVE_VEHICLE_FIELDS` ; `isPublished: true` et `archivedAt: null` présents dans **chaque** requête publique ; `SOLD` exclu par défaut et réintroduit uniquement par `availability: "all"` ; médias non `PUBLIC` filtrés à la projection (image principale **et** galerie) ; `toPricingActor` ne sert le tarif Revendeur qu'à un client `APPROVED` (visiteur, client standard, personnel et compte suspendu voient le Standard) ; `total` compté avec le même `where` que la liste ; tri toujours départagé par `id` ; `inspectionOnRequest` ne divulgue qu'un booléen, jamais le document.
- **Correction d'intégration 1** — `CatalogueCard` expose désormais `brandId` et `modelId` : l'interface de fiche ne pouvait pas appeler `listSimilarVehicles` sans eux et contournait l'absence par une correspondance de **noms** de référentiel (fragile : deux marques homonymes, ou section silencieusement omise). La page de fiche passe maintenant les identifiants projetés. L'assertion de forme exacte de `tests/unit/catalogue.service.test.ts` a été mise à jour en conséquence (décision T30).
- **Correction d'intégration 2** — `app/page.tsx` (stub) supprimé au profit de `app/(public)/page.tsx` : deux pages résolvant vers `/` auraient fait échouer le build (décision T29).
- Tests ajoutés/couvrant le lot : `tests/unit/catalogue.service.test.ts` (38 tests : visibilité, disponibilité, prix par acteur, transport séparé, pagination, validation des filtres, tri, résolution des URL de médias, absence de champ sensible), `tests/unit/seo.test.ts` et `tests/unit/whatsapp.test.ts` (28 tests).

## 4. Limites et vérifications non réalisées

### 4.1 Aucune base de données (inchangé, D15) — c'est la limite dominante

Toutes les lectures publiques lèvent `PrismaClientInitializationError` faute de `DATABASE_URL`. Conséquences directes :

- **Le chemin de succès n'a jamais été exercé de bout en bout** : aucune liste peuplée, aucune fiche rendue, aucun prix affiché, aucune galerie, aucun véhicule similaire, aucune pagination réelle.
- Les écrans observés sont l'**état de repli géré** (« Catalogue temporairement indisponible »), pas l'écran nominal. Un 200 sur `/voitures/inconnu` traduit ce repli, **pas** un défaut de `notFound()`, qui reste branché mais inatteignable ici.
- Les tests de RLS, de politiques Storage et de contraintes `CHECK` restent **non exécutés**.
- Aucun index ni plan de requête n'a été observé ; les performances annoncées par le doc 18 §6 ne sont **pas** mesurées.

### 4.2 Autres limites vérifiées ou assumées

- **Tri par prix non scalable** : Prisma ne peut pas trier sur une relation filtrée par `pricingProfile`, donc `price_asc`/`price_desc` **chargent l'ensemble filtré puis découpent la page en mémoire**. Correct, mais le coût croît avec la taille du catalogue ; c'est signalé dans le code et à revoir (colonne dénormalisée ou vue SQL) dès que le volume le justifie.
- **Recherche limitée** : la recherche porte sur le titre et la référence. Ni la marque, ni le modèle, ni la description ne sont indexés — le corpus ne prescrit pas les champs de recherche, aucun n'a été inventé.
- **Aucune conversion de devises** (D26) : un tri ou un filtre de prix compare des montants de devises possiblement différentes ; la devise est toujours affichée à côté du montant.
- **Images non optimisées** : `next/image` est utilisé en `unoptimized` car `next.config.ts` ne déclare aucun `images.remotePatterns` (aucun hôte Supabase n'est connu dans cet environnement). L'exigence doc 18 §8 (formats modernes, tailles responsives) reste donc **non satisfaite**.
- **Aucune vérification visuelle** : pas de navigateur dans cet environnement, donc pas de contrôle à 360 px / 390 px ni de rendu RTL — exigences doc 05 §8 et §9 **non vérifiées**.
- **Sitemap** : la tolérance à l'absence de base n'a été observée qu'auprès d'un catalogue vide ; l'inclusion réelle des fiches publiées n'est pas démontrée. Base d'URL par défaut `http://localhost:3000` tant que `NEXT_PUBLIC_APP_URL` n'est pas fournie.
- **Médias** : aucune URL de média réelle n'a pu être produite (aucun bucket Supabase configuré) ; `resolvePublicMediaUrl` n'a été exercé qu'en unitaire. Le comportement dépend de D18 (bucket public ou privé).
- **Serveur de vérification resté actif** : le `next start` de contrôle (port 4311) n'a pas pu être arrêté depuis la session (commande de recherche de processus refusée par la porte d'approbation). Le port 4311 reste occupé par un processus orphelin ; à arrêter manuellement (`kill` sur le processus `next start -p 4311`). Aucun impact sur le dépôt. Un autre `next start -p 3000` préexistant n'a pas été touché.
- **Hors périmètre du lot, comme prévu** : favoris visiteur et client (D30), langues EN/AR et RTL (D29), calcul des règles d'import (D31), mode « prix sur demande » (D24), My Diaba Auto, commandes, CRM.

## 5. Suite

1. **Fournir une base non productive** : c'est le seul moyen de valider le parcours catalogue en conditions réelles (liste peuplée, fiche, prix par acteur, RLS, plan de requêtes). Sans elle, chaque lot suivant reste vérifié par tests unitaires et états de repli.
2. **Amorcer des données réelles** : marques, modèles (D14/D25), puis véhicules avec média principal public et prix actif STANDARD, sinon le catalogue public restera vide (D32).
3. **Trancher** D26 (taux de change), D27 (numéro WhatsApp et paramètres de contact), D28 (indexation des véhicules vendus), D29 (langues et routage), D30 (favoris : à remonter ou non avant le lot 4), D31 (règles d'import).
4. **Renseigner `NEXT_PUBLIC_APP_URL`** en préproduction et production, ainsi que `images.remotePatterns` dans `next.config.ts` pour que les visuels du bucket soient optimisés.
5. **Lot suivant** : My Diaba Auto — favoris, recherches enregistrées et demandes (`CLAUDE.md` §11), en réutilisant la voie de lecture publique et les gardes existantes.
