/**
 * Texte d'une page → blocs affichables (module pur).
 *
 * Format volontairement minimal, pour qu'un texte saisi ne puisse jamais produire de HTML :
 * - une ligne `## Titre` est un intertitre ;
 * - des lignes consécutives commençant par `- ` forment une liste ;
 * - le reste est un paragraphe ; une ligne vide sépare deux blocs.
 * Le rendu passe par des éléments React : rien n'est interprété comme du HTML.
 */

export type PageBlock =
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

export function parsePageBody(body: string): PageBlock[] {
  const blocks: PageBlock[] = [];
  const lines = body.replace(/\r\n?/g, "\n").split("\n");

  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ type: "list", items: list });
      list = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "") {
      flushParagraph();
      flushList();
    } else if (line.startsWith("## ") && line.slice(3).trim() !== "") {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", text: line.slice(3).trim() });
    } else if (line.startsWith("- ") && line.slice(2).trim() !== "") {
      flushParagraph();
      list.push(line.slice(2).trim());
    } else {
      flushList();
      paragraph.push(line);
    }
  }

  flushParagraph();
  flushList();

  return blocks;
}
