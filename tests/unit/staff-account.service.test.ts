import { beforeEach, describe, expect, it } from "vitest";
import {
  configureStaffAccountDependencies,
  createStaffAccount,
  listStaffAccounts,
  resetStaffAccountDependencies,
  setStaffAccountStatus,
  updateStaffAccount,
  type StaffAccountRepository,
  type StaffAccountRow,
  type StaffAccountView,
  type StaffIdentityPort,
} from "@/services/staff-account.service";
import type { AuditLogEntry } from "@/services/audit.service";
import { customerActor, staffActor } from "@/tests/unit/support/actors";
import { AppError } from "@/lib/errors";

/**
 * Tests du service « Personnel » (lot 7 — ferme D23).
 *
 * Ce qui est réellement verrouillé ici, et qui ne se voit pas à la lecture :
 * - un compte personnel n'est **jamais** créé pour une adresse existante (élévation de privilège) ;
 * - une création qui échoue côté base **retire** l'utilisateur Auth (sinon l'adresse reste refusée) ;
 * - **aucun mot de passe n'apparaît** dans une entrée d'audit, une vue ou une erreur ;
 * - un membre ne peut ni se désactiver, ni se retirer son rôle ADMIN (verrouillage définitif) ;
 * - un changement de statut écrit une entrée d'audit **motivée** (D06) ;
 * - un acteur sans `user.manage` est refusé partout, sans qu'aucune écriture ne soit tentée.
 *
 * Aucun accès base : les ports sont remplacés par des doubles en mémoire.
 */

type Doubles = {
  repository: StaffAccountRepository;
  identity: StaffIdentityPort;
  audits: AuditLogEntry[];
  state: {
    rows: StaffAccountRow[];
    emails: Record<string, string>;
    users: Record<string, string>;
    createdUsers: { email: string; password: string }[];
    deletedUsers: string[];
    discarded: string[];
    identityUpdates: unknown[];
    roleReplacements: unknown[];
    statusUpdates: unknown[];
    failCreate: boolean;
    roles: { code: string; name: string }[];
  };
};

const NEW_PASSWORD = "Motdepasse!2026";

function row(overrides: Partial<StaffAccountRow> = {}): StaffAccountRow {
  return {
    staffId: "staff-2",
    authUserId: "auth-1",
    firstName: "Awa",
    lastName: "Diop",
    jobTitle: null,
    status: "ACTIVE",
    roleCodes: ["COMMERCIAL"],
    ...overrides,
  };
}

function makeDoubles(): Doubles {
  const state: Doubles["state"] = {
    rows: [row()],
    emails: { "auth-1": "awa.diop@diaba-auto.test" },
    users: {},
    createdUsers: [],
    deletedUsers: [],
    discarded: [],
    identityUpdates: [],
    roleReplacements: [],
    statusUpdates: [],
    failCreate: false,
    roles: [
      { code: "ADMIN", name: "Administrateur" },
      { code: "COMMERCIAL", name: "Commercial" },
    ],
  };

  const repository: StaffAccountRepository = {
    async listRoles() {
      return state.roles;
    },
    async listStaffAccounts() {
      return state.rows;
    },
    async findStaffAccount(staffId) {
      return state.rows.find((item) => item.staffId === staffId) ?? null;
    },
    async createStaffAccount(input) {
      if (state.failCreate) {
        throw new AppError("INTERNAL", "Échec simulé de la base.");
      }
      const created = row({
        staffId: "staff-new",
        authUserId: input.authUserId,
        firstName: input.firstName,
        lastName: input.lastName,
        jobTitle: input.jobTitle,
        roleCodes: [...input.roleCodes],
      });
      state.rows.push(created);
      return created;
    },
    async updateStaffIdentity(input) {
      state.identityUpdates.push(input);
    },
    async replaceStaffRoles(input) {
      state.roleReplacements.push(input);
      return { assigned: ["ADMIN"], revoked: ["COMMERCIAL"] };
    },
    async setProfileStatus(input) {
      state.statusUpdates.push(input);
    },
    async discardNewAccount(authUserId) {
      state.discarded.push(authUserId);
    },
  };

  const identity: StaffIdentityPort = {
    async findUserIdByEmail(email) {
      return state.users[email] ?? null;
    },
    async createConfirmedUser({ email, password }) {
      state.createdUsers.push({ email, password });
      const id = `auth-${state.createdUsers.length}`;
      state.users[email] = id;
      state.emails[id] = email;
      return id;
    },
    async deleteUser(authUserId) {
      state.deletedUsers.push(authUserId);
    },
    async findEmailsByIds(ids) {
      const found: Record<string, string> = {};
      for (const id of ids) {
        if (state.emails[id]) found[id] = state.emails[id];
      }
      return found;
    },
  };

  const audits: AuditLogEntry[] = [];

  return { repository, identity, audits, state };
}

function install(doubles: Doubles): void {
  configureStaffAccountDependencies({
    repository: doubles.repository,
    identity: doubles.identity,
    audit: async (entry) => {
      doubles.audits.push(entry);
    },
    adminClient: () => {
      throw new Error("Le client d'administration ne doit pas être utilisé dans ces tests.");
    },
  });
}

const validCreate = {
  email: "Nouveau.Membre@Diaba-Auto.Test",
  firstName: "Moussa",
  lastName: "Fall",
  jobTitle: "Commercial",
  roleCodes: ["COMMERCIAL"],
  password: NEW_PASSWORD,
  confirmPassword: NEW_PASSWORD,
};

let doubles: Doubles;

beforeEach(() => {
  resetStaffAccountDependencies();
  doubles = makeDoubles();
  install(doubles);
});

describe("listStaffAccounts", () => {
  it("refuse un acteur sans user.manage", async () => {
    await expect(listStaffAccounts(customerActor)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("listes les comptes avec leur adresse et les rôles attribuables", async () => {
    const result = await listStaffAccounts(staffActor());

    expect(result.roles.map((role) => role.code)).toEqual(["ADMIN", "COMMERCIAL"]);
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]).toMatchObject({
      staffId: "staff-2",
      email: "awa.diop@diaba-auto.test",
      firstName: "Awa",
      roleCodes: ["COMMERCIAL"],
    });
    // Projection : aucun identifiant interne ne fuit vers l'écran.
    expect(JSON.stringify(result)).not.toContain("auth-1");
    expect(JSON.stringify(result)).not.toContain("authUserId");
  });
});

describe("createStaffAccount", () => {
  it("crée le compte, attribue les rôles et trace l'attribution", async () => {
    const view = await createStaffAccount(staffActor(), validCreate);

    expect(doubles.state.createdUsers).toEqual([
      { email: "nouveau.membre@diaba-auto.test", password: NEW_PASSWORD },
    ]);
    expect(view).toMatchObject({
      email: "nouveau.membre@diaba-auto.test",
      roleCodes: ["COMMERCIAL"],
      status: "ACTIVE",
    });
    expect(doubles.audits.map((entry) => entry.action)).toEqual(["staff.role.assign"]);
  });

  it("ne laisse JAMAIS le mot de passe sortir du service", async () => {
    const view = await createStaffAccount(staffActor(), validCreate);

    const serialized = JSON.stringify({ view, audits: doubles.audits });
    expect(serialized).not.toContain(NEW_PASSWORD);
    expect(serialized).not.toContain("password");
  });

  it("refuse une adresse déjà utilisée, sans rien créer", async () => {
    doubles.state.users["existe@diaba-auto.test"] = "auth-existant";

    await expect(
      createStaffAccount(staffActor(), { ...validCreate, email: "existe@diaba-auto.test" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(doubles.state.createdUsers).toEqual([]);
    expect(doubles.audits).toEqual([]);
  });

  it("RETIRE l'utilisateur Auth si la base échoue (sinon l'adresse reste refusée)", async () => {
    doubles.state.failCreate = true;

    await expect(createStaffAccount(staffActor(), validCreate)).rejects.toMatchObject({
      code: "INTERNAL",
    });

    expect(doubles.state.discarded).toEqual(["auth-1"]);
    expect(doubles.state.deletedUsers).toEqual(["auth-1"]);
  });

  it("refuse un rôle inconnu avant de créer le moindre compte", async () => {
    await expect(
      createStaffAccount(staffActor(), { ...validCreate, roleCodes: ["SUPER_ADMIN"] }),
    ).rejects.toMatchObject({ code: "VALIDATION", fields: ["roleCodes"] });

    expect(doubles.state.createdUsers).toEqual([]);
  });

  it("refuse une confirmation de mot de passe différente", async () => {
    await expect(
      createStaffAccount(staffActor(), { ...validCreate, confirmPassword: "Autre!2026xx" }),
    ).rejects.toMatchObject({ code: "VALIDATION", fields: ["confirmPassword"] });

    expect(doubles.state.createdUsers).toEqual([]);
  });

  it("refuse les champs privilégiés envoyés par le navigateur", async () => {
    // Le schéma est strict : un champ inconnu est REFUSÉ, jamais appliqué en silence.
    await expect(
      createStaffAccount(staffActor(), { ...validCreate, userType: "STAFF" } as unknown),
    ).rejects.toMatchObject({ code: "VALIDATION", fields: ["userType"] });

    expect(doubles.state.createdUsers).toEqual([]);
  });
});

describe("updateStaffAccount", () => {
  it("remplace les rôles et trace attribution ET retrait", async () => {
    await updateStaffAccount(staffActor(), {
      staffId: "staff-2",
      firstName: "Awa",
      lastName: "Diop",
      jobTitle: "Responsable",
      roleCodes: ["ADMIN"],
    });

    expect(doubles.state.roleReplacements).toEqual([{ staffId: "staff-2", roleCodes: ["ADMIN"] }]);
    expect(doubles.audits.map((entry) => entry.action)).toEqual([
      "staff.role.assign",
      "staff.role.revoke",
    ]);
  });

  it("refuse qu'un membre se retire à lui-même le rôle ADMIN", async () => {
    doubles.state.rows = [row({ staffId: "staff-1", roleCodes: ["ADMIN"] })];

    await expect(
      updateStaffAccount(staffActor(), {
        staffId: "staff-1",
        firstName: "Awa",
        lastName: "Diop",
        roleCodes: ["COMMERCIAL"],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(doubles.state.roleReplacements).toEqual([]);
  });

  it("renvoie NOT_FOUND (refus neutre) pour un compte inexistant", async () => {
    await expect(
      updateStaffAccount(staffActor(), {
        staffId: "staff-inconnu",
        firstName: "A",
        lastName: "B",
        roleCodes: ["ADMIN"],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("setStaffAccountStatus", () => {
  it("désactive un compte et trace le motif", async () => {
    await setStaffAccountStatus(staffActor(), {
      staffId: "staff-2",
      status: "DISABLED",
      reason: "Fin de contrat",
    });

    expect(doubles.state.statusUpdates).toEqual([{ staffId: "staff-2", status: "DISABLED" }]);
    expect(doubles.audits[0]).toMatchObject({
      action: "staff.deactivate",
      reason: "Fin de contrat",
      oldValues: { status: "ACTIVE" },
    });
  });

  it("réactive un compte", async () => {
    doubles.state.rows = [row({ staffId: "staff-2", status: "DISABLED" })];

    await setStaffAccountStatus(staffActor(), {
      staffId: "staff-2",
      status: "ACTIVE",
      reason: "Retour de congé",
    });

    expect(doubles.audits[0]).toMatchObject({ action: "staff.activate" });
  });

  it("EXIGE un motif (exigence d'audit)", async () => {
    await expect(
      setStaffAccountStatus(staffActor(), { staffId: "staff-2", status: "DISABLED", reason: "" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    expect(doubles.state.statusUpdates).toEqual([]);
  });

  it("refuse qu'un membre désactive son propre compte", async () => {
    // Le compte de l'acteur doit exister : sinon le refus serait NOT_FOUND, pas l'auto-protection.
    doubles.state.rows = [row({ staffId: "staff-1" })];

    await expect(
      setStaffAccountStatus(staffActor(), {
        staffId: "staff-1",
        status: "DISABLED",
        reason: "Test",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(doubles.state.statusUpdates).toEqual([]);
  });

  it("refuse un statut hors du vocabulaire exposé", async () => {
    await expect(
      setStaffAccountStatus(staffActor(), {
        staffId: "staff-2",
        status: "SUSPENDED",
        reason: "Test",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("projection", () => {
  it("n'expose jamais le mot de passe dans la vue publique", async () => {
    const view: StaffAccountView = await createStaffAccount(staffActor(), validCreate);

    expect(Object.keys(view).sort()).toEqual([
      "active",
      "email",
      "firstName",
      "jobTitle",
      "lastName",
      "roleCodes",
      "staffId",
      "status",
    ]);
  });
});
