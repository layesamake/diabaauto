import { z } from "zod";

/**
 * Pages de contenu modifiables depuis le back-office, avec leur texte par défaut.
 *
 * Le texte par défaut s'affiche tant qu'aucune version n'a été enregistrée (ou si la base est
 * illisible) : une page publique n'est jamais vide. Il ne reprend que ce que le cadrage produit
 * établit (véhicules neufs et d'occasion en Chine ou au Sénégal, parcours découvrir → comprendre →
 * contacter → suivre, aucun paiement en ligne) : aucun chiffre, délai, garantie, adresse ou
 * témoignage n'y figure. Ajouter une page impose aussi d'étendre le CHECK SQL de M12.
 *
 * Format du texte : voir `page-body.ts`.
 */

export const SITE_PAGE_SLUGS = ["a-propos", "comment-ca-marche", "mentions-legales"] as const;

export type SitePageSlug = (typeof SITE_PAGE_SLUGS)[number];

export type SitePageDefinition = {
  slug: SitePageSlug;
  /** Nom court dans le back-office. */
  label: string;
  publicPath: string;
  defaultTitle: string;
  defaultBody: string;
  /** Description pour les moteurs de recherche (fixe : elle n'est pas modifiable). */
  description: string;
};

export const SITE_PAGES: Readonly<Record<SitePageSlug, SitePageDefinition>> = {
  "a-propos": {
    slug: "a-propos",
    label: "À propos",
    publicPath: "/a-propos",
    defaultTitle: "À propos de Diaba Auto",
    description: "Diaba Auto présente et vend des véhicules neufs et d'occasion situés en Chine ou au Sénégal.",
    defaultBody: [
      "Diaba Auto présente et commercialise des véhicules neufs et d'occasion, situés en Chine ou au Sénégal.",
      "## Ce que nous faisons",
      "Chaque véhicule du catalogue indique clairement où il se trouve aujourd'hui, son prix et sa disponibilité. Vous trouvez le véhicule qui vous convient, puis vous nous contactez pour discuter de l'offre.",
      "Vous ne trouvez pas ce que vous cherchez ? Décrivez-nous le véhicule voulu depuis la page « Commander » : nous revenons vers vous.",
    ].join("\n\n"),
  },
  "comment-ca-marche": {
    slug: "comment-ca-marche",
    label: "Comment ça marche",
    publicPath: "/comment-ca-marche",
    defaultTitle: "Comment ça marche",
    description: "Les étapes pour trouver un véhicule, comprendre l'offre, contacter Diaba Auto et suivre sa demande.",
    defaultBody: [
      "Du premier regard au suivi de votre demande, en quatre étapes.",
      "## 1. Trouver un véhicule",
      "Parcourez le catalogue, utilisez la recherche et les filtres, puis ouvrez les fiches qui vous intéressent.",
      "## 2. Comprendre l'offre",
      "Chaque fiche présente les photos, les caractéristiques, le prix et la disponibilité du véhicule.",
      "## 3. Contacter Diaba Auto",
      "Écrivez-nous sur WhatsApp ou depuis la page Contact. Un message est une demande d'information : il ne vaut ni réservation, ni commande.",
      "## 4. Suivre votre demande",
      "Avec un compte, vous retrouvez vos demandes et vos commandes dans « My Diaba Auto ». Aucun paiement n'est demandé en ligne.",
    ].join("\n\n"),
  },
  "mentions-legales": {
    slug: "mentions-legales",
    label: "Mentions légales et confidentialité",
    publicPath: "/mentions-legales",
    defaultTitle: "Mentions légales et confidentialité",
    description:
      "Éditeur du site, données personnelles, cookies et mesure d'audience de Diaba Auto.",
    defaultBody: [
      "Cette page réunit les informations légales du site Diaba Auto et explique comment vos données sont traitées. Les éléments entre crochets sont à compléter par Diaba Auto.",
      "## Éditeur du site",
      "Site édité par Diaba Auto. [À compléter : forme juridique, immatriculation, adresse du siège, nom du responsable de la publication.]",
      "## Hébergement",
      "Le site est hébergé par Vercel et ses données par Supabase. [À compléter si besoin : coordonnées des hébergeurs.]",
      "## Données personnelles",
      "Lorsque vous nous contactez ou créez un compte, nous recueillons les informations que vous fournissez (par exemple nom, téléphone, e-mail et le contenu de votre message) dans le seul but de répondre à votre demande et de suivre votre dossier. Ces données ne sont pas vendues.",
      "## Cookies et mesure d'audience",
      "Le site peut utiliser Google Analytics pour mesurer son audience (pages consultées, clics vers WhatsApp). Cette mesure n'est activée qu'après votre accord : rien n'est envoyé tant que vous n'avez pas cliqué sur « Accepter » dans le bandeau, et vous pouvez changer d'avis à tout moment avec « Gérer les cookies », en bas de chaque page.",
      "Aucun message, e-mail ou numéro de téléphone n'est transmis à l'outil de mesure. La publicité et la personnalisation Google sont désactivées. Si vous refusez, les cookies de mesure sont supprimés.",
      "## Vos droits",
      "Vous pouvez demander l'accès à vos données, leur rectification ou leur suppression en nous écrivant depuis la page Contact. [À compléter : référence à la réglementation applicable et délai de réponse.]",
      "## Contact",
      "Pour toute question relative à ces informations, utilisez la page Contact du site.",
    ].join("\n\n"),
  },
};

export const sitePageSlugSchema = z.enum(SITE_PAGE_SLUGS);

export function isSitePageSlug(value: unknown): value is SitePageSlug {
  return typeof value === "string" && (SITE_PAGE_SLUGS as readonly string[]).includes(value);
}

export const SITE_PAGE_TITLE_MAX = 120;
export const SITE_PAGE_BODY_MAX = 20_000;

const inputSchema = z
  .object({
    slug: sitePageSlugSchema,
    title: z.string().trim().min(1).max(SITE_PAGE_TITLE_MAX),
    body: z.string().trim().min(1).max(SITE_PAGE_BODY_MAX),
  })
  .strict();

export type SitePageInput = z.infer<typeof inputSchema>;

export type SitePageParse = { ok: true; value: SitePageInput } | { ok: false; fields: ("title" | "body")[] };

/** Valide une saisie ; les erreurs ne nomment que des champs, jamais leur contenu. */
export function parseSitePageInput(raw: unknown): SitePageParse {
  const result = inputSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, value: result.data };
  }

  const fields = new Set<"title" | "body">();
  for (const issue of result.error.issues) {
    if (issue.path[0] === "title" || issue.path[0] === "body") {
      fields.add(issue.path[0]);
    }
  }

  return { ok: false, fields: [...fields] };
}

/** Lit UNIQUEMENT les champs connus du formulaire. */
export function readSitePageForm(formData: FormData): { slug: string; title: string; body: string } {
  const read = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  return { slug: read("slug"), title: read("title"), body: read("body") };
}
