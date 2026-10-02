# Contrat — Lot 7 « Personnel » (gestion des comptes internes)

Gel de l'interface avant fan-out. Toute divergence entre ce document et le code est un défaut :
le code fait foi une fois vérifié, ce document doit alors être corrigé dans le même changement.

## 1. Décisions utilisateur (à respecter sans les réinterpréter)

| # | Question | Décision |
|---|---|---|
| U1 | « Vendeurs » | = **comptes internes** : administrateurs et commerciaux (doc 07 §2 nomme le rôle « Commercial »). |
| U2 | Création/suppression de comptes **clients** | **Hors périmètre.** On reste dans le corpus : les clients continuent de s'inscrire eux-mêmes (doc 11 : profil créé à l'inscription). L'écran Clients existant (consultation + modification) est inchangé. |
| U3 | « Supprimer » un compte | = **désactiver** (`Profile.status = DISABLED`), **réversible**. Aucune suppression définitive. Cohérent avec doc 20 §4 « suspendre plutôt que supprimer » et avec le fait qu'aucun corpus ne prescrit la suppression d'un compte. |

## 2. Décisions techniques prises par l'orchestrateur

| # | Sujet | Décision | Raison |
|---|---|---|---|
| T47 | Permission d'entrée | `user.manage` — **existante** (ADMIN seul, seed `prisma/seed-data.ts`). Aucun code de permission créé (T42 / D21). | Doc 07 §4 « System » + D01. |
| T48 | Vocabulaire d'audit | `staff.role.assign`, `staff.role.revoke`, `staff.activate`, `staff.deactivate`, `account.status.change` — **déjà dans `AUDITED_ACTIONS`**, jamais utilisés. | Doc 17 (« rôles ») + D06 (« rôle/permission du personnel, statut de compte » sont audités). |
| T49 | Motif obligatoire | Un changement de statut de compte exige un **motif** (`account.status.change` ∈ `sensitiveTransitionsRequiringReason`). | `services/audit.service.ts`. |
| T50 | Auto-protection | Un membre ne peut **ni changer son propre statut, ni se retirer à lui-même le rôle ADMIN**. Aucun garde « dernier administrateur ». | Garde anti-verrouillage, pas une règle métier. Perdre tous les admins reste réparable par `npm run staff:grant` (D04). |
| T51 | Mot de passe initial | Le formulaire de création **exige un mot de passe initial** saisi par l'administrateur (politique `lib/auth/password-policy.ts`). | Le projet n'a **ni SMTP ni `mailer_autoconfirm`** : une invitation ne partirait pas. Aucun mot de passe n'est généré, renvoyé, journalisé ou affiché. À remplacer par une invitation quand SMTP sera configuré. |
| T52 | Aucune adoption de compte existant | Si l'adresse existe déjà, la création est **refusée**. Aucun rattachement, aucune conversion. | Convertir un compte client en compte personnel serait une élévation de privilège sur un compte réel. |
| T53 | Profil client parasite | Le trigger `on_auth_user_created` crée `profiles` **+ `customer_profiles`** pour tout nouvel utilisateur Auth. La création d'un compte personnel **supprime** ce `customer_profiles` dans la même transaction. | Un membre du personnel ne doit pas apparaître dans la liste Clients. |
| T54 | Compensation | Si la transaction échoue après la création de l'utilisateur Auth, le service **supprime le profil puis l'utilisateur Auth** (ordre imposé par la FK `RESTRICT` de T39). | Éviter un compte orphelin impossible à recréer (T52 refuse l'adresse existante). |
| T55 | Statut | Actions exposées : `ACTIVE` ↔ `DISABLED`. | `identity.service` traite **tout statut ≠ ACTIVE** comme non authentifié (contrat §4.1) : `DISABLED` révoque réellement l'accès. |
| T56 | E-mail | L'e-mail vit dans `auth.users`, **pas** dans `profiles`. Il est lu via l'API admin Supabase. | Aucune colonne ajoutée au schéma (le corpus fait foi). |

## 3. Fichiers gelés

### Parent (ne pas modifier)
- `lib/supabase/admin.ts` — client Supabase `service_role` serveur.
- `lib/staff/staff-account-form.ts` — analyse du `FormData` (module pur, sans JSX).
- `services/staff-account.service.ts` — service métier (port + audit + gardes).
- `repositories/staff-account.repository.ts` — repository Prisma.
- `tests/unit/*staff-account*` — tests du parent.

### Enfant UI (périmètre exclusif)
- `app/admin/personnel/page.tsx`
- `app/admin/personnel/actions.ts`
- `app/admin/personnel/loading.tsx`
- `components/admin/StaffAccountsTable.tsx`
- `components/admin/StaffAccountCreateForm.tsx`
- `components/admin/StaffAccountEditForm.tsx`
- `lib/i18n/staff-accounts.fr.ts`
- **Interdit** : modifier le service, le repository, `components/admin/AdminHeader.tsx`, `components/admin/rubric-screens.ts`, `components/admin/rubric-icons.ts`, `lib/i18n/index.ts` (le parent s'en charge).

## 4. Interface gelée du service

```ts
// services/staff-account.service.ts
export type StaffAccountStatus = "ACTIVE" | "DISABLED";

export type StaffAccountView = {
  staffId: string;          // identifiant de la ligne affichée (staff_profiles.id)
  email: string | null;     // lu via l'API admin ; null si l'utilisateur Auth a disparu
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  status: ProfileStatus;    // "ACTIVE" | "SUSPENDED" | "DISABLED"
  active: boolean;          // status === "ACTIVE"
  roleCodes: string[];      // ex. ["ADMIN"], ["COMMERCIAL"]
};

export type StaffRoleOption = { code: string; name: string };
export type StaffAccountList = { accounts: StaffAccountView[]; roles: StaffRoleOption[] };

export async function listStaffAccounts(actor: Actor): Promise<StaffAccountList>;
export async function createStaffAccount(actor: Actor, input: unknown): Promise<StaffAccountView>;
export async function updateStaffAccount(actor: Actor, input: unknown): Promise<StaffAccountView>;
export async function setStaffAccountStatus(actor: Actor, input: unknown): Promise<StaffAccountView>;

// Erreurs : AppError("VALIDATION"|"FORBIDDEN"|"CONFLICT"|"NOT_FOUND"|"INTERNAL", message, fields?).
// `fields` liste TOUJOURS les champs fautifs (ex. ["newPassword"], ["roleCodes"]).
```

### Entrées acceptées (analyse stricte : tout champ inconnu ou privilégié est REFUSÉ)
- `createStaffAccount` : `{ email, firstName, lastName, jobTitle?, roleCodes, password }`
- `updateStaffAccount` : `{ staffId, firstName, lastName, jobTitle?, roleCodes }`
- `setStaffAccountStatus` : `{ staffId, status: "ACTIVE"|"DISABLED", reason }`
- **Refusés explicitement** : `userType`, `status` (sur create/update), `id`, `profileId`, `authUserId`, `active`, `roleCodes` inconnus, `email` sur update.

### Contrat des actions serveur (enfant)
`app/admin/personnel/actions.ts` — module `"use server"`, types `AdminActionState` (réutiliser
`@/app/admin/clients/actions` ou l'enveloppe `@/lib/errors` déjà utilisée par les écrans admin) :
```ts
export async function createStaffAccountAction(formData: FormData): Promise<AdminActionState>;
export async function updateStaffAccountAction(formData: FormData): Promise<AdminActionState>;
export async function setStaffAccountStatusAction(formData: FormData): Promise<AdminActionState>;
```
Chaque action : `try { ... return ok(...) } catch (error) { return failure(error) }`, comme
`app/admin/clients/actions.ts`. **Aucune valeur de mot de passe n'est renvoyée, journalisée ou
réaffichée** : le formulaire est vidé après succès (`event.currentTarget` capturé AVANT l'`await`).

## 5. Étapes d'intégration réservées au parent
1. `components/admin/rubric-icons.ts` + `rubric-screens.ts` : entrée « Personnel » (icône `personnel`).
2. `components/admin/AdminHeader.tsx` : clé `"personnel"` + lien conditionné à `user.manage`.
3. `lib/i18n/index.ts` : export de l'espace de noms.
4. Test de non-régression : toute rubrique a une icône existante.

## 6. Commandes de vérification
```bash
npx tsc --noEmit --incremental false
npx eslint .
npx vitest run
NODE_ENV=production npm run build
```
