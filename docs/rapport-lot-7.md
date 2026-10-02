# Rapport de lot 7 — Personnel : gestion des comptes internes

> Référence : demande « permettre aux comptes administrateurs de gérer les comptes d'utilisateurs ».
> Corpus faisant foi : génération courante `docs/` (doc 05 « Clients », doc 07 §4 permissions et rôles, doc 11 inscription, doc 17 audit, doc 20 « suspendre plutôt que supprimer », doc 21 exclusions).
> Contrat gelé : `docs/contrat-lot-7.md`. Décisions : `docs/decisions.md` **T47, T48, T49** ; **D23 refermée**, **D06 outillée**.

## 1. Ce qui est livré

| Domaine | Livrable |
|---|---|
| Écran | Back-office « Personnel » (`/admin/personnel`), gardé par la permission **`user.manage`** (ADMIN), entrée dans `AdminHeader` et dans l'accueil back-office (icône badge) |
| Ajout | Formulaire : e-mail, prénom, nom, fonction, rôles, mot de passe initial + confirmation. Crée l'utilisateur Auth **puis** le profil `STAFF`, la fiche `staff_profiles` et les `staff_roles` |
| Modification | Identité (prénom, nom, fonction) et rôles (`staff.role.assign` / `staff.role.revoke`) |
| Désactivation | Statut `DISABLED` / `ACTIVE`, **motif obligatoire**, réversible en un clic (T48) |
| Service | `services/staff-account.service.ts` — port/injection, gardes, projection explicite, audit |
| Dépôt | `repositories/staff-account.repository.ts` (Prisma), `lib/supabase/admin.ts` (client `service_role`, serveur uniquement) |
| Formulaire | `lib/staff/staff-account-form.ts` — schémas Zod **stricts**, réutilisant la politique de mot de passe de `lib/auth/password-policy.ts` |
| Interface | `components/admin/StaffAccountsTable.tsx`, `StaffAccountCreateForm.tsx`, `StaffAccountEditForm.tsx`, `lib/i18n/staff-accounts.fr.ts` |
| Correctif | `repositories/staff-customer.repository.ts` : la liste Clients filtre `profile.user_type = 'CUSTOMER'` (T49) |

## 2. Périmètre : ce qui n'est **pas** livré, et pourquoi (T47)

La demande citait « clients, clients revendeurs, vendeurs (ajouter, modifier, supprimer) ». Le corpus ne le permet pas, et rien n'a été inventé :

- **Aucune gestion des comptes clients.** Doc 05 borne l'écran Clients à « voir profil, favoris, demandes, commandes » (lecture) ; le module Client ne définit que `customer.view` / `customer.edit`, **aucune** permission `customer.create` / `customer.delete`. T42 interdit d'inventer un code tant que D21 n'est pas tranchée, et doc 11 fait naître un compte client par l'inscription.
- **Aucun type de compte « vendeur ».** Le mot n'apparaît que dans les **exclusions** du PRD (« marketplace vendeurs tiers et compte fournisseur ») et doc 21 interdit la marketplace multi-vendeur. Doc 07 ne nomme qu'un rôle interne, « Commercial ».
- **Pas de suppression physique.** Doc 20 impose « suspendre plutôt que supprimer », et T39 fait refuser en base la suppression d'un compte portant une activité. La suppression est donc une **désactivation réversible**.
- **Aucune permission, action d'audit ou champ inventé.** La permission est `user.manage` (existante, ADMIN, jusqu'ici sans écran) ; les actions d'audit `staff.role.assign`, `staff.role.revoke`, `staff.activate`, `staff.deactivate` figuraient déjà dans `AUDITED_ACTIONS`, prescrites par doc 17 mais jamais utilisées.

Ces trois points de périmètre ont été soumis à Diaba Auto et confirmés (« rester dans le corpus »).

## 3. Sécurité

| Règle | Mise en œuvre | Vérification |
|---|---|---|
| Seul un porteur de `user.manage` agit | Garde de service (`requireStaff`) **en plus** de la garde de page : l'écran n'est pas la frontière de sécurité | Commercial sans `user.manage` : accès refusé, **0** e-mail de compte, **0** formulaire, **0** lien « Personnel » dans la navigation |
| Un membre ne peut pas s'auto-affaiblir | Refus de retirer son propre rôle `ADMIN`, de se désactiver | Test unitaire + scénario sur base réelle |
| Un mot de passe n'est **jamais** journalisé ni renvoyé | Le mot de passe n'entre ni dans l'audit, ni dans les messages d'erreur, ni dans les valeurs de retour | `grep` sur les messages + tests unitaires |
| Champs privilégiés non modifiables par le client | Schémas **stricts** : `userType`, `status`, `id`, `userId` envoyés par un formulaire sont **refusés** (`fields: ["userType"]`) ; le canal `FormData` ne lit que les champs connus | `tests/unit/staff-account-form.test.ts` |
| Les routes d'administration ne fuient pas la liste | La page rend l'état de refus, jamais les données | Vérifié : 14 046 octets de refus, aucun nom ni e-mail de compte |
| Aucun mot de passe ne transite par le navigateur de vérification | Le compte d'essai est créé par le service ; l'interface ne sert qu'à vérifier liste, modification et statut | — |

## 4. Vérification

### Tests et compilation

| Contrôle | Résultat |
|---|---|
| `npx tsc --noEmit` | **0 erreur** |
| `npx eslint .` | **0 erreur** |
| `npx vitest run` | **487 tests / 41 fichiers**, tous verts |
| `npm run build` (production) | Vert — route `/admin/personnel` 4,8 kB |

Nouveaux fichiers de test : `staff-account.service.test.ts` (18 tests), `staff-account-form.test.ts`, `staff-customer-where.test.ts`.

### Scénario réel contre la base et l'API Auth Supabase — **35 / 35**

Exécuté par `repro-lot7.ts` sur la base de production (compte créé, exercé, **puis retiré**) :

1. Création : utilisateur Auth créé, profil `STAFF` + fiche + rôles, **résidu `customer_profiles` supprimé** ;
2. L'e-mail en double est refusé (`CONFLICT`) ;
3. Un compte existant n'est **jamais adopté** (pas de rattachement silencieux) ;
4. Un rôle inconnu est refusé ;
5. Un acteur client est refusé (`FORBIDDEN`) ;
6. Ajout puis **retrait** de rôle ;
7. **Désactivation** → l'acteur résolu passe de `staff` à **`suspended`** : l'accès est réellement révoqué ;
8. Réactivation → `staff` de nouveau ;
9. Auto-protection (retrait de son propre rôle `ADMIN`, auto-désactivation) ;
10. Nettoyage : aucun résidu laissé en base.

### Parcours d'interface, dans un navigateur

| Étape | Résultat |
|---|---|
| Liste | 3 comptes affichés (nom, e-mail, fonction, rôles, statut), lien « Gérer » par ligne |
| Modification | Nom et rôles modifiés depuis le formulaire → **écrits en base** (`Test Interface Modifié`, rôles `ADMIN, COMMERCIAL`) et affichés |
| Désactivation | Motif obligatoire ; action acceptée → statut `DISABLED` **en base** |
| Réactivation | Badge « Désactivé » → « Actif » après clic sur « Réactiver » |
| Audit | **Entrées réelles écrites** : `staff.role.assign` (`{"roleCodes":["ADMIN"]}`) et `staff.deactivate` (`{"reason":"Vérification interface du lot 7","status":"DISABLED"}`) |

### Correctif de la liste Clients (T49)

Vérifié sur la base réelle : elle contient **2 `customer_profiles`, tous deux des résidus de comptes personnel, 0 vrai client**. Avant le correctif, ces deux administrateurs s'affichaient comme clients (nom vide, segment « Individuel »). Après : la page affiche « Aucun client ne correspond à ces critères » (**0 ligne** de tableau).

## 5. Reste à faire

| # | Point | Nature |
|---|---|---|
| 1 | **2 `customer_profiles` résiduels** des comptes `etiennesamake@gmail.com` et `admin.validation@diaba-auto.test` | Propreté des données en production — **suppression à autoriser** (désormais invisible, sans effet fonctionnel) |
| 2 | **Compte de test `admin.validation@diaba-auto.test`** (ADMIN sur la production) | Supprimer ou désactiver — décision de Diaba Auto |
| 3 | **`mailer_autoconfirm = true`** (dashboard Supabase) | Hors périmètre : le jeton d'accès ne porte pas `auth_config_write`. Sans ce basculement, inscription et réinitialisation par e-mail ne fonctionnent pas |
| 4 | **SMTP** | Aucun fournisseur configuré |
| 5 | **D03** (workflow d'approbation d'une habilitation), **D21** (liste canonique des permissions) | Arbitrages produit en attente |
