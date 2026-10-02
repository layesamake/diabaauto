import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Test d'intégration de la Server Action `changePasswordAction` (écran « Mon compte »).
 *
 * La propriété de sécurité testée ici est celle qui compte : **aucune modification de mot de passe
 * sans une re-authentification réussie par le mot de passe actuel**. Supabase ne contrôle pas
 * l'ancien mot de passe dans `updateUser`, donc c'est le code applicatif qui porte la garantie — et
 * ce test la verrouille.
 *
 * Les modules externes (Supabase, session, en-têtes) sont simulés : ce test ne touche aucun service
 * réel et n'écrit aucun mot de passe nulle part.
 */

const holder = vi.hoisted(() => ({
  actor: { kind: "staff", active: true, permissions: [] } as Record<string, unknown>,
  signInResult: { error: null as unknown },
  updateResult: { error: null as unknown },
  signInCalls: [] as { email: string; password: string }[],
  updateCalls: [] as { password: string }[],
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "x-forwarded-for": "127.0.0.1", "user-agent": "vitest" }),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentActor: async () => holder.actor,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { email: "membre@diaba-auto.test" } }, error: null }),
      signInWithPassword: async (credentials: { email: string; password: string }) => {
        holder.signInCalls.push(credentials);
        return holder.signInResult;
      },
      updateUser: async (values: { password: string }) => {
        holder.updateCalls.push(values);
        return holder.updateResult;
      },
    },
  }),
}));

const { changePasswordAction } = await import("@/app/admin/compte/actions");

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }

  return data;
}

const valid = {
  currentPassword: "Actuel!12345",
  newPassword: "Nouveau!12345",
  confirmPassword: "Nouveau!12345",
};

beforeEach(() => {
  holder.actor = { kind: "staff", active: true, permissions: [] };
  holder.signInResult = { error: null };
  holder.updateResult = { error: null };
  holder.signInCalls.length = 0;
  holder.updateCalls.length = 0;
});

describe("changePasswordAction", () => {
  it("changes the password when the current one is correct", async () => {
    const state = await changePasswordAction(form(valid));

    expect(state).toEqual({ data: { message: expect.stringContaining("modifié"), redirectTo: null } });
    expect(holder.signInCalls).toEqual([
      { email: "membre@diaba-auto.test", password: "Actuel!12345" },
    ]);
    expect(holder.updateCalls).toEqual([{ password: "Nouveau!12345" }]);
  });

  it("REFUSES to touch the password when the current one is wrong", async () => {
    holder.signInResult = { error: { message: "Invalid login credentials" } };

    const state = await changePasswordAction(form({ ...valid, currentPassword: "Mauvais!12345" }));

    expect("error" in state).toBe(true);
    if ("error" in state) {
      expect(state.error.message).toContain("actuel est incorrect");
      expect(state.error.message).not.toContain("Mauvais!12345");
    }
    // La garantie centrale : updateUser n'est JAMAIS appelé sans re-authentification réussie.
    expect(holder.updateCalls).toEqual([]);
  });

  it("surfaces a Supabase update failure without claiming success", async () => {
    holder.updateResult = { error: { message: "Weak password" } };

    const state = await changePasswordAction(form(valid));

    expect("error" in state).toBe(true);
    expect(holder.signInCalls).toHaveLength(1);
  });

  it("rejects a too short new password BEFORE contacting Supabase", async () => {
    const state = await changePasswordAction(
      form({ ...valid, newPassword: "court", confirmPassword: "court" }),
    );

    expect("error" in state).toBe(true);
    if ("error" in state) {
      expect(state.error.fields).toContain("newPassword");
    }
    expect(holder.signInCalls).toEqual([]);
    expect(holder.updateCalls).toEqual([]);
  });

  it("rejects a mismatched confirmation BEFORE contacting Supabase", async () => {
    const state = await changePasswordAction(
      form({ ...valid, confirmPassword: "Autre!123456" }),
    );

    expect("error" in state).toBe(true);
    if ("error" in state) {
      expect(state.error.fields).toEqual(["confirmPassword"]);
    }
    expect(holder.updateCalls).toEqual([]);
  });

  it("refuses a non-staff actor and writes nothing", async () => {
    holder.actor = { kind: "customer", active: true, permissions: [] };

    const state = await changePasswordAction(form(valid));

    expect("error" in state).toBe(true);
    if ("error" in state) {
      expect(state.error.code).toBe("FORBIDDEN");
    }
    expect(holder.signInCalls).toEqual([]);
    expect(holder.updateCalls).toEqual([]);
  });
});
