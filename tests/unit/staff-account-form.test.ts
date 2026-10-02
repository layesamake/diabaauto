import { describe, expect, it } from "vitest";
import {
  parseStaffAccountCreateInput,
  parseStaffAccountStatusInput,
  parseStaffAccountUpdateInput,
  StaffAccountValidationError,
} from "@/lib/staff/staff-account-form";

/**
 * Analyse des formulaires « Personnel ».
 *
 * Deux propriétés comptent vraiment ici :
 * - **un champ privilégié envoyé par le navigateur n'est jamais lu** (`userType`, `status`, `id`…),
 *   donc jamais appliqué — le formulaire ne peut pas fabriquer un administrateur ;
 * - **aucun message d'erreur ne contient une valeur saisie** : le mot de passe initial d'un nouveau
 *   membre ne doit jamais ressortir, même dans un message d'échec.
 */

const PASSWORD = "Motdepasse!2026";

function form(values: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) data.append(key, item);
    } else {
      data.set(key, value);
    }
  }

  return data;
}

const validCreate = {
  email: "Membre.Nouveau@Diaba-Auto.Test",
  firstName: "Moussa",
  lastName: "Fall",
  jobTitle: "Commercial",
  roleCodes: ["COMMERCIAL"],
  password: PASSWORD,
  confirmPassword: PASSWORD,
};

describe("parseStaffAccountCreateInput", () => {
  it("normalise l'adresse en minuscules et ne renvoie jamais la confirmation", () => {
    const input = parseStaffAccountCreateInput(form(validCreate));

    expect(input.email).toBe("membre.nouveau@diaba-auto.test");
    expect(input.roleCodes).toEqual(["COMMERCIAL"]);
    expect(input.jobTitle).toBe("Commercial");
    expect(Object.keys(input)).not.toContain("confirmPassword");
  });

  it("dédoublonne les rôles", () => {
    const input = parseStaffAccountCreateInput(
      form({ ...validCreate, roleCodes: ["ADMIN", "ADMIN", "COMMERCIAL"] }),
    );

    expect(input.roleCodes.sort()).toEqual(["ADMIN", "COMMERCIAL"]);
  });

  it("ignore un champ privilégié envoyé par le navigateur", () => {
    const input = parseStaffAccountCreateInput(
      form({ ...validCreate, userType: "STAFF", status: "ACTIVE", id: "forgé" }),
    );

    // Le champ n'est pas refusé bruyamment : il n'est JAMAIS lu, donc jamais appliqué.
    expect(Object.keys(input).sort()).toEqual([
      "email",
      "firstName",
      "jobTitle",
      "lastName",
      "password",
      "roleCodes",
    ]);
  });

  it("refuse une confirmation différente sans citer le mot de passe", () => {
    let captured: unknown = null;
    try {
      parseStaffAccountCreateInput(form({ ...validCreate, confirmPassword: `${PASSWORD}x` }));
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(StaffAccountValidationError);
    expect((captured as StaffAccountValidationError).fields).toEqual(["confirmPassword"]);
    expect((captured as StaffAccountValidationError).message).not.toContain(PASSWORD);
  });

  it("refuse un mot de passe trop court et ne cite que le nom du champ", () => {
    let captured: unknown = null;
    try {
      parseStaffAccountCreateInput(
        form({ ...validCreate, password: "court", confirmPassword: "court" }),
      );
    } catch (error) {
      captured = error;
    }

    expect((captured as StaffAccountValidationError).fields).toContain("password");
    expect((captured as StaffAccountValidationError).message).not.toContain("court");
  });

  it("refuse une adresse invalide", () => {
    expect(() => parseStaffAccountCreateInput(form({ ...validCreate, email: "pas-une-adresse" }))).toThrow(
      StaffAccountValidationError,
    );
  });

  it("refuse l'absence de rôle", () => {
    const withoutRoles = {
      email: validCreate.email,
      firstName: validCreate.firstName,
      lastName: validCreate.lastName,
      password: validCreate.password,
      confirmPassword: validCreate.confirmPassword,
    };

    expect(() => parseStaffAccountCreateInput(form(withoutRoles))).toThrow(
      StaffAccountValidationError,
    );
  });
});

describe("parseStaffAccountUpdateInput", () => {
  it("accepte une modification et ignore le statut", () => {
    const input = parseStaffAccountUpdateInput(
      form({
        staffId: "staff-2",
        firstName: "Awa",
        lastName: "Diop",
        roleCodes: ["ADMIN"],
        status: "DISABLED",
        email: "autre@diaba-auto.test",
      }),
    );

    expect(input).toEqual({
      staffId: "staff-2",
      firstName: "Awa",
      lastName: "Diop",
      jobTitle: null,
      roleCodes: ["ADMIN"],
    });
  });

  it("refuse un identifiant vide", () => {
    expect(() =>
      parseStaffAccountUpdateInput(form({ staffId: "", firstName: "A", lastName: "B", roleCodes: ["ADMIN"] })),
    ).toThrow(StaffAccountValidationError);
  });
});

describe("parseStaffAccountStatusInput", () => {
  it("accepte une désactivation motivée", () => {
    expect(
      parseStaffAccountStatusInput(form({ staffId: "staff-2", status: "DISABLED", reason: "Départ" })),
    ).toEqual({ staffId: "staff-2", status: "DISABLED", reason: "Départ" });
  });

  it("refuse un statut hors vocabulaire", () => {
    expect(() =>
      parseStaffAccountStatusInput(form({ staffId: "staff-2", status: "SUSPENDED", reason: "x" })),
    ).toThrow(StaffAccountValidationError);
  });

  it("refuse un motif vide", () => {
    let captured: unknown = null;
    try {
      parseStaffAccountStatusInput(form({ staffId: "staff-2", status: "DISABLED", reason: "" }));
    } catch (error) {
      captured = error;
    }

    expect((captured as StaffAccountValidationError).fields).toContain("reason");
  });
});
