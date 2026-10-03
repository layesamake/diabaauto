# Diaba Auto — Instructions de développement pour l’IA

Ce fichier guide l’agent qui développe Diaba Auto. Placé à la racine du dépôt, il est chargé automatiquement au début de chaque session. Il complète les spécifications produit et techniques ; il ne les remplace pas.

## 1. Mission

Construire une application Diaba Auto fonctionnelle, maintenable et testée, depuis les fondations jusqu’à la préparation de la production.

Diaba Auto présente et commercialise des véhicules neufs et d’occasion situés en Chine ou au Sénégal. Le parcours principal est : découvrir un véhicule, comprendre l’offre, contacter Diaba Auto, puis suivre sa demande ou sa commande.

Trois espaces sont prévus :

- **Site public** : catalogue, recherche, fiches véhicules et prise de contact.
- **My Diaba Auto** : espace personnel du client Standard ou Revendeur.
- **Back-office** : gestion commerciale et administration, selon les permissions.

La V1 ne comprend pas de paiement en ligne. Une demande de contact ne vaut ni réservation, ni commande confirmée, ni vente.

## 2. Sources et décisions

Avant de développer, lire les fichiers d’instructions du dépôt et la documentation disponible. Inspecter aussi le code existant, les migrations, les tests et les fichiers de configuration.

Références métier principales :

1. PRD Diaba Auto.
2. Architecture fonctionnelle.
3. Modèle de données.
4. Architecture technique GitHub, Vercel et Supabase.
5. Spécifications UX/UI et cartographie des écrans.

Les 16 documents complémentaires couvrent la charte UI, les permissions, les règles métier, les workflows, le backend, Supabase, Prisma, les migrations, les tests, la roadmap, le CI/CD, la sécurité, le SEO, les analytics, l’exploitation et le prompt maître.

Les ranger dans `docs/` lorsqu’ils sont fournis. Ne pas prétendre avoir lu un document absent ou inaccessible. Une version Markdown peut faciliter leur consultation, mais elle doit préserver le contenu de sa source.

**État des références au moment de la rédaction de ce fichier :** les documents complémentaires ont été produits à partir d’un contexte partiel. Le schéma Prisma fourni est une proposition de référence, pas un schéma validé contre l’intégralité du modèle initial. Les transitions et paramètres proposés doivent être rapprochés des cinq cadrages complets avant d’être figés.

Pour résoudre une ambiguïté :

- Respecter les dernières décisions explicites du responsable produit.
- Comparer les documents concernés et les décisions déjà enregistrées.
- Consigner le conflit avec ses conséquences dans `docs/decisions.md`.
- Proposer une résolution précise si la décision affecte le métier, les droits, les données ou le périmètre.
- Continuer les travaux indépendants de cette décision.

Ne pas transformer un exemple de prix, de référence, de date ou de délai en règle réelle. Ne pas ajouter de fonctionnalités hors périmètre sans demande.

## 3. Stack et organisation

Stack cible : Next.js App Router, TypeScript strict, Tailwind CSS, Supabase PostgreSQL, Supabase Auth, Supabase Storage, Prisma, GitHub et Vercel.

Respecter les versions, le gestionnaire de paquets et les conventions du dépôt existant. Pour un dépôt neuf, vérifier la compatibilité des versions retenues et enregistrer le fichier de verrouillage. Ne pas recopier une configuration Prisma ou Next.js incompatible avec les versions installées.

Organisation indicative à adapter à l’existant :

```text
app/
  (public)/
  (auth)/
  my-diaba-auto/
  admin/
  api/
components/
  ui/
  vehicle/
  shared/
features/
  auth/
  vehicles/
  customers/
  resellers/
  favorites/
  leads/
  orders/
  pricing/
services/
repositories/
lib/
  auth/
  permissions/
  validation/
  supabase/
  prisma/
prisma/
  migrations/
tests/
docs/
```

Séparer les responsabilités :

- Les composants présentent les données et recueillent les interactions.
- Les Server Actions et Route Handlers valident les entrées et appellent les services.
- Les services appliquent les règles métier, permissions et transactions.
- La couche d’accès aux données exécute les requêtes nécessaires.
- L’infrastructure gère Auth, Storage, journalisation et intégrations.

Ne pas disperser une règle de prix, une permission ou une transition dans plusieurs composants. Ne pas ajouter une abstraction qui n’a pas d’usage concret.

## 4. Fonctionnalités à couvrir

### Site public

- Accueil et présentation de Diaba Auto.
- Catalogue avec recherche, filtres, tri et pagination côté serveur.
- Fiche véhicule avec galerie, référence, prix applicable, caractéristiques, localisation et disponibilité.
- Favoris visiteurs.
- Demande personnalisée de véhicule via `/commander`.
- Pages « Comment ça marche », « À propos » et « Contact ».
- Connexion, inscription et récupération de compte.
- Actions WhatsApp, appel et partage lorsque leurs coordonnées sont configurées.

Routes publiques de référence : `/`, `/voitures`, `/voitures/[slug]`, `/commander`, `/comment-ca-marche`, `/a-propos`, `/contact`.

### My Diaba Auto

- Tableau de bord et profil personnel.
- Favoris persistants et recherches enregistrées.
- Demandes et commandes avec leur suivi autorisé.
- Demande de statut Revendeur et consultation de son état.
- Paramètres du compte et déconnexion.

### Back-office

- Véhicules, photos et documents.
- Catalogue automobile et caractéristiques administrables.
- Clients et demandes Revendeur.
- Prospects et affectations commerciales.
- Commandes et historique logistique prévu par les spécifications.
- Personnel, rôles et permissions.
- Contenus, paramètres, analytics et audit.

Chaque fonctionnalité livrée doit fonctionner avec les services et données réels du projet. Les données fictives servent aux tests et aux démonstrations identifiées. Aucun bouton principal ne doit simuler un succès sans effectuer l’opération attendue.

## 5. Invariants métier

### Prix

- Stocker les montants avec une précision décimale adaptée et la devise `XOF`.
- Déterminer le prix applicable côté serveur dans un service central.
- Un visiteur ou client Standard reçoit le prix Standard.
- Un Revendeur approuvé et actif reçoit le tarif Revendeur applicable.
- Un Revendeur en attente, refusé ou suspendu reçoit le prix Standard.
- Ne jamais transmettre un tarif confidentiel à un acteur non autorisé, même dans une réponse JSON, le HTML, les données de page ou les caches.
- Conserver le prix convenu de la commande indépendamment des modifications ultérieures du prix catalogue.
- Ne pas inventer une remise, une promotion ou une règle de remplacement lorsqu’un tarif manque. Appliquer la décision métier documentée.

Le prix, le rôle et la propriété d’une ressource ne doivent jamais être établis à partir d’une simple valeur envoyée par le navigateur.

### Véhicules et publication

- Afficher explicitement la localisation actuelle : Chine ou Sénégal.
- Distinguer conceptuellement publication, disponibilité commerciale et progression logistique ; suivre leur représentation validée dans le modèle.
- Vérifier la complétude avant publication et n’exposer que les champs publics autorisés.
- Contrôler les transitions de réservation et de vente côté serveur.
- Empêcher deux opérations concurrentes de réserver ou vendre le même véhicule de manière incompatible.
- Un véhicule vendu sort des résultats disponibles, tout en restant identifiable dans les historiques et favoris selon la politique de visibilité.

### Clients, demandes et commandes

- Une inscription Revendeur n’accorde pas automatiquement les avantages tarifaires.
- Les clients consultent uniquement leurs données privées.
- Une demande personnalisée peut suivre le parcours visiteur prévu par les spécifications ; conserver les coordonnées nécessaires même sans compte.
- La création d’une commande, sa confirmation et ses changements d’état relèvent des acteurs habilités.
- Les changements sensibles conservent acteur, date, motif et historique appropriés.

### Favoris

- Les favoris anonymes peuvent être stockés localement.
- Les favoris d’un compte persistent entre appareils.
- Une fusion après connexion est idempotente et évite les doublons.
- Une déconnexion ne supprime pas les favoris du compte sur le serveur ; nettoyer les données privées locales pour éviter leur exposition au prochain utilisateur de l’appareil.

## 6. Identités, permissions et sécurité

Supabase Auth est la source d’identité. Il gère les mots de passe et les sessions. Ne pas créer un second système d’authentification métier.

Relier les profils métier aux identités Auth selon le modèle validé. Rendre fiable et idempotente la création de ces profils. Ne pas permettre à un utilisateur de se déclarer STAFF, ADMIN ou Revendeur approuvé via des données éditables par lui-même.

Pour chaque opération privée ou sensible :

1. Vérifier la session côté serveur.
2. Vérifier le statut du compte.
3. Vérifier la permission nécessaire.
4. Vérifier la portée et la propriété des données.
5. Valider les entrées.
6. Exécuter l’opération et son audit dans une transaction lorsque nécessaire.

Masquer une action dans l’interface ne constitue pas une autorisation. Une protection de route seule ne suffit pas pour les Server Actions ou API.

Activer les politiques RLS appropriées sur les tables exposées par Supabase. Tester leurs autorisations et refus. Les connexions Prisma ou privilégiées peuvent contourner RLS : vérifier explicitement leurs droits effectifs et les contrôles applicatifs.

Garder les documents privés dans un bucket privé et produire un accès temporaire après contrôle. Un bucket public ne doit contenir aucun original confidentiel : masquer sa référence en base ne protège pas son URL.

Valider les uploads, contrôler les abus des formulaires et de l’authentification, et ne pas exposer d’erreur SQL ou de trace interne au client.

Les secrets restent côté serveur. Ne jamais mettre une clé privilégiée dans une variable `NEXT_PUBLIC_*`, le dépôt, les logs ou une réponse navigateur.

## 7. Contrats backend et données

Définir pour chaque action : entrée, acteur autorisé, portée, préconditions, résultat, effets secondaires et erreurs attendues.

Utiliser des schémas de validation serveur. Borner la pagination, valider les filtres et refuser les champs sensibles non autorisés dans les mises à jour.

Retourner des objets explicitement sélectionnés selon l’acteur. Éviter de sérialiser un modèle Prisma complet, notamment pour les véhicules, clients et commandes.

Prévoir des erreurs fonctionnelles compréhensibles : validation, authentification requise, accès interdit, ressource introuvable, conflit et limitation de fréquence. Ne pas révéler inutilement l’existence d’une ressource privée.

Pour les mutations sensibles :

- Protéger les reprises et doubles soumissions par une stratégie d’idempotence adaptée.
- Utiliser contraintes SQL et transactions pour garantir les invariants.
- Gérer les conflits de version ou de statut avec un message permettant de recharger l’état courant.
- Enregistrer l’audit requis et revalider les données affichées après succès.

Utiliser les contraintes de base : clés étrangères, unicités, valeurs obligatoires et contrôles de cohérence. Les marques et autres listes administrables doivent rester des données administrables, pas des enums figés sans justification.

Stocker les dates en UTC et appliquer le fuseau de présentation configuré.

## 8. Interface et identité graphique

Utiliser le logo fourni en conservant ses proportions. Palette de référence :

| Usage | Couleur |
| --- | --- |
| Bleu principal | `#0063DF` |
| Survol principal | `#0354A3` |
| Bleu vif | `#099FF8` |
| Cyan | `#2AC9FC` |
| Cyan clair | `#66E5FC` |
| Bleu nuit | `#011D4F` |
| Bleu profond | `#001787` |

Centraliser les tokens de couleurs, espacements, typographie et composants. Vérifier le contraste de chaque combinaison utilisée : la palette ne garantit pas à elle seule l’accessibilité.

Le public et My Diaba Auto sont conçus d’abord pour le mobile. Le back-office privilégie l’efficacité sur ordinateur et reste utilisable sur écran réduit.

Prévoir pour chaque écran les états chargement, vide, erreur, succès et absence de permission lorsque pertinents. Assurer la navigation clavier, le focus visible, les libellés persistants et des messages d’erreur au bon emplacement.

Soigner les photos, la lisibilité des prix et les actions de contact. Ne pas inventer d’adresse, de numéro, de témoignage ou de promesse commerciale pour remplir l’interface.

## 9. SEO, performance et analytics

Les fiches publiques doivent proposer titre, description, URL canonique et métadonnées cohérentes. Le sitemap et les données structurées utilisent uniquement des informations réellement publiques et exactes.

Exclure les espaces privés de l’indexation avec les mécanismes adaptés. Les directives SEO ne remplacent jamais les contrôles d’accès.

Optimiser les images et la pagination. Limiter les colonnes sélectionnées et ajouter des index justifiés par les requêtes. Ne jamais partager un cache de prix personnalisé entre segments ou utilisateurs. Invalider les données concernées après modification de prix ou de disponibilité.

Instrumenter les événements définis dans le plan Analytics : recherche, consultation, favori, clic WhatsApp, demande, inscription Revendeur et commande. Distinguer un clic de contact d’une conversion réellement constatée. Ne pas envoyer les messages libres, emails ou téléphones dans un outil de trafic sans nécessité et décision explicite.

## 10. Migrations et environnements

Versionner les changements de schéma, contraintes, politiques RLS et configurations nécessaires. Définir une seule procédure de migration pour éviter que deux outils modifient indépendamment la même structure.

Les seeds sont répétables. Ils ne contiennent ni secrets, ni mots de passe administrateur, ni données personnelles de production.

Séparer développement, préproduction et production. Les previews ne doivent pas accéder à la base de production.

Avant une évolution destructive, préparer la migration des données, la compatibilité applicative et le plan de reprise. Un retour au déploiement Vercel précédent ne restaure pas automatiquement la base.

Préparer un `.env.example` sans valeurs sensibles et documenter le rôle de chaque variable réellement utilisée. Ne pas inventer de clés ou prétendre qu’une intégration est configurée si ses identifiants manquent.

Ne pas effectuer de déploiement public, de migration en production ou d’opération destructive sans autorisation explicite couvrant cette action.

## 11. Ordre de développement

Suivre la roadmap validée. Ordre de référence :

1. Fondations, configuration, environnements et CI.
2. Authentification, profils, permissions et audit.
3. Référentiels, véhicules et catalogue public.
4. My Diaba Auto, favoris, recherches et demandes.
5. Approbation Revendeur, tarification et CRM.
6. Commandes, disponibilité et suivi logistique.
7. Administration, contenus, paramètres et analytics.
8. Recette, sécurité, performance et préparation de production.

Pour chaque lot, réaliser un parcours complet avec ses données, services, interfaces et contrôles. Préserver le travail existant de l’utilisateur. Ne pas réécrire un module fonctionnel sans raison liée au besoin.

## 12. Vérifications et définition de terminé

Découvrir les commandes disponibles dans le dépôt et exécuter les contrôles adaptés au lot : typage, qualité du code, tests et build. Ne pas annoncer l’exécution d’une commande inexistante ou non lancée.

Les tests prioritaires couvrent :

- Le prix affiché pour visiteur, Standard, Revendeur en attente, approuvé et suspendu.
- L’absence de tarif confidentiel dans les réponses à un acteur non autorisé.
- L’interdiction d’accès aux données d’un autre client et aux actions administratives.
- Les documents privés et les permissions du personnel.
- La persistance et la fusion des favoris.
- Les transitions de réservation et vente, y compris les accès concurrents.
- Le prix figé et la visibilité des commandes.
- Les politiques RLS et les parcours utilisant une connexion privilégiée.

Vérifier les interfaces modifiées dans un navigateur sur mobile et ordinateur. Contrôler les erreurs, états vides et formulaires, ainsi que l’absence de débordement de contenu.

Un lot est terminé lorsque son parcours fonctionne, ses contrôles pertinents passent, ses changements de données sont reproductibles et sa documentation est à jour. Toute vérification impossible reste explicitement indiquée comme non réalisée.

## 13. Communication et autonomie

Avancer de manière autonome sur les décisions techniques courantes et les travaux réversibles autorisés. Ne pas demander une confirmation à chaque fichier ou commande.

Lorsqu’une décision produit manque, formuler une question ciblée avec une recommandation et son impact. Continuer les travaux qui n’en dépendent pas.

À la fin d’un lot, fournir un compte rendu bref :

- Fonctionnalités désormais utilisables.
- Modifications importantes des données ou de la configuration.
- Vérifications réellement exécutées et résultat.
- Limites, décisions en attente et prochaines dépendances.

Ne pas déclarer l’application prête pour la production si les tests, accès, intégrations ou procédures nécessaires n’ont pas été vérifiés.

## 14. Première intervention dans le dépôt

1. Lire ce fichier, les instructions locales et les références disponibles.
2. Inspecter le projet et relever ce qui existe réellement.
3. Identifier les incohérences et documents manquants sans supposer leur contenu.
4. Établir un plan court du prochain lot réalisable.
5. Implémenter ce lot, le vérifier et documenter le résultat.

Commencer le développement après cette analyse. Ne pas s’arrêter à la proposition d’un plan si les travaux suivants sont déjà autorisés et réalisables.
