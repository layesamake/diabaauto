import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePageBody } from "@/lib/site-pages/page-body";
import {
  SITE_PAGES,
  SITE_PAGE_SLUGS,
  parseSitePageInput,
  readSitePageForm,
} from "@/lib/site-pages/site-pages";
import type { SitePageRepository, StoredSitePage } from "@/repositories/site-page.repository";
import {
  configureSitePageRepository,
  getSitePageForEdit,
  listSitePages,
  resetSitePageRepository,
  updateSitePage,
} from "@/services/site-page.service";
import type { AuditLogEntry } from "@/services/audit.service";
import { customerActor, staffActor, visitorActor } from "@/tests/unit/support/actors";

describe("parsePageBody", () => {
  it("découpe intertitres, listes et paragraphes", () => {
    const blocks = parsePageBody("Intro\nsuite\n\n## Titre\n\n- un\n- deux\n\nFin");

    expect(blocks).toEqual([
      { type: "paragraph", text: "Intro\nsuite" },
      { type: "heading", text: "Titre" },
      { type: "list", items: ["un", "deux"] },
      { type: "paragraph", text: "Fin" },
    ]);
  });

  it("ne produit jamais de HTML : une balise reste du texte", () => {
    const blocks = parsePageBody("<script>alert(1)</script>");

    expect(blocks).toEqual([{ type: "paragraph", text: "<script>alert(1)</script>" }]);
  });

  it("tolère les fins de ligne Windows, les lignes vides multiples et « ## » seul", () => {
    expect(parsePageBody("A\r\n\r\n\r\n## \r\nB")).toEqual([
      { type: "paragraph", text: "A" },
      { type: "paragraph", text: "##\nB" },
    ]);
  });

  it("le texte par défaut de chaque page est affichable (au moins un bloc, un intertitre)", () => {
    for (const slug of SITE_PAGE_SLUGS) {
      const blocks = parsePageBody(SITE_PAGES[slug].defaultBody);
      expect(blocks.length, slug).toBeGreaterThan(1);
      expect(blocks.some((block) => block.type === "heading"), slug).toBe(true);
    }
  });
});

describe("parseSitePageInput", () => {
  it("accepte une saisie valide et rogne les espaces", () => {
    expect(parseSitePageInput({ slug: "a-propos", title: " Titre ", body: " Texte " })).toEqual({
      ok: true,
      value: { slug: "a-propos", title: "Titre", body: "Texte" },
    });
  });

  it("refuse un slug inconnu, une clé inconnue, un titre ou un texte vide ou trop long", () => {
    expect(parseSitePageInput({ slug: "admin", title: "T", body: "B" }).ok).toBe(false);
    expect(parseSitePageInput({ slug: "a-propos", title: "T", body: "B", extra: 1 }).ok).toBe(false);
    expect(parseSitePageInput({ slug: "a-propos", title: " ", body: "B" })).toEqual({ ok: false, fields: ["title"] });
    expect(parseSitePageInput({ slug: "a-propos", title: "T", body: "" })).toEqual({ ok: false, fields: ["body"] });
    expect(parseSitePageInput({ slug: "a-propos", title: "T".repeat(121), body: "B" }).ok).toBe(false);
    expect(parseSitePageInput({ slug: "a-propos", title: "T", body: "B".repeat(20_001) }).ok).toBe(false);
  });

  it("ne lit que les champs connus du formulaire", () => {
    const form = new FormData();
    form.set("slug", "a-propos");
    form.set("title", "T");
    form.set("body", "B");
    form.set("userType", "ADMIN");

    expect(Object.keys(readSitePageForm(form)).sort()).toEqual(["body", "slug", "title"]);
  });
});

describe("services/site-page.service", () => {
  afterEach(() => resetSitePageRepository());

  function fake(stored: StoredSitePage[] = []) {
    const audits: AuditLogEntry[] = [];
    const save = vi.fn<SitePageRepository["save"]>(async (page, buildAudit) => {
      const before = stored.find((item) => item.slug === page.slug) ?? null;
      const after = { ...page, updatedAt: new Date("2026-10-03T20:00:00Z") };
      audits.push(buildAudit(before, after));
      return after;
    });
    configureSitePageRepository({
      read: async (slug) => stored.find((item) => item.slug === slug) ?? null,
      readAll: async () => stored,
      save,
    });
    return { audits, save };
  }

  it("refuse visiteur, client et personnel sans content.manage, sans rien lire ni écrire", async () => {
    const { save } = fake();

    for (const actor of [visitorActor, customerActor, staffActor(["vehicle.view"])]) {
      await expect(listSitePages(actor)).rejects.toThrow();
      await expect(getSitePageForEdit(actor, "a-propos")).rejects.toThrow();
      await expect(updateSitePage(actor, { slug: "a-propos", title: "T", body: "B" })).rejects.toThrow();
    }
    expect(save).not.toHaveBeenCalled();
  });

  it("liste les deux pages avec le texte par défaut tant que rien n'est enregistré", async () => {
    fake();
    const pages = await listSitePages(staffActor(["content.manage"]));

    expect(pages.map((page) => page.slug)).toEqual([...SITE_PAGE_SLUGS]);
    expect(pages.every((page) => !page.customized && page.updatedAt === null)).toBe(true);
    expect(pages[0]?.body).toBe(SITE_PAGES["a-propos"].defaultBody);
  });

  it("renvoie la version enregistrée quand elle existe", async () => {
    fake([{ slug: "a-propos", title: "Notre histoire", body: "Texte", updatedAt: new Date("2026-10-01T00:00:00Z") }]);

    const page = await getSitePageForEdit(staffActor(["content.manage"]), "a-propos");

    expect(page).toMatchObject({ title: "Notre histoire", body: "Texte", customized: true });
  });

  it("une page inconnue est introuvable", async () => {
    fake();

    await expect(getSitePageForEdit(staffActor(["content.manage"]), "secret")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("refuse une saisie invalide sans rien écrire", async () => {
    const { save } = fake();

    await expect(
      updateSitePage(staffActor(["content.manage"]), { slug: "a-propos", title: "", body: "B" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(save).not.toHaveBeenCalled();
  });

  it("enregistre et journalise titre et taille, jamais le texte entier", async () => {
    const { audits } = fake();

    await updateSitePage(staffActor(["content.manage"]), {
      slug: "comment-ca-marche",
      title: "Nouveau titre",
      body: "Un texte confidentiel de brouillon",
    });

    const entry = audits[0];
    expect(entry?.action).toBe("content.change");
    expect(entry?.entityType).toBe("SitePage");
    expect(entry?.entityId).toBe("comment-ca-marche");
    expect(entry?.newValues).toEqual({ title: "Nouveau titre", bodyLength: 34 });
    expect(JSON.stringify(entry)).not.toContain("confidentiel");
  });
});
