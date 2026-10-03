#!/usr/bin/env node
/**
 * Recette de sécurité (lot 8) — `docs/14_Cahier_tests_criteres_acceptation.docx` §6 « RLS / sécurité »
 * et `docs/17_Cahier_securite.docx`.
 *
 * Le script n'écrit **jamais** en base : toutes les sondes sont des lectures refusées ou filtrées.
 * Aucun secret n'est affiché : seuls des verdicts, des codes HTTP et des noms de tables.
 *
 * Contrôles :
 *  1. la clé publique (`anon`) ne lit aucune table privée — refus HTTP ou 0 ligne (RLS) ;
 *  2. la clé publique ne lit pas la colonne confidentielle `vehicles.reseller_price` ;
 *  3. la clé publique ne voit que les véhicules publiés ;
 *  4. le bucket privé `vehicle-documents` n'est pas listable anonymement ;
 *  5. la clé `service_role` absente du bundle client (`.next/static`) ;
 *  6. aucun secret du projet présent dans les fichiers suivis par git.
 *
 * Usage : `npm run verify:security` (lit `.env.local`, surchargeable par l'environnement).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = process.cwd();

function loadEnvFile(name) {
  const path = join(APP_DIR, name);
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const PUBLIC_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !PUBLIC_KEY) {
  console.error(
    "Configuration incomplète : renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY (.env.local).",
  );
  process.exit(2);
}

const results = [];

function record(id, label, ok, detail) {
  results.push({ id, label, ok, detail });
}

function publicHeaders(extra = {}) {
  return { apikey: PUBLIC_KEY, Authorization: `Bearer ${PUBLIC_KEY}`, ...extra };
}

/** GET PostgREST avec la clé publique. */
async function restGet(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: publicHeaders() });
  const text = await response.text();
  return { status: response.status, text };
}

/** Tables dont l'accès anonyme doit être refusé ou rendu vide par RLS. */
const PRIVATE_TABLES = [
  "audit_logs",
  "site_settings",
  "profiles",
  "customer_profiles",
  "staff_profiles",
  "roles",
  "permissions",
  "role_permissions",
  "staff_roles",
  "brands",
  "vehicle_models",
  "vehicle_prices",
  "price_history",
  "exchange_rates",
  "vehicle_documents",
  "vehicle_features",
  "vehicle_options",
  "leads",
  "lead_notes",
  "lead_activities",
  "reseller_applications",
  "custom_requests",
  "orders",
  "order_events",
  "reservations",
  "vehicle_logistics_events",
  "favorite_vehicles",
  "saved_searches",
  // Table technique de Prisma Migrate : RLS non activée, donc protégée par les seuls privilèges.
  "_prisma_migrations",
];

async function checkPrivateTables() {
  const leaked = [];
  const denied = [];
  const emptied = [];

  for (const table of PRIVATE_TABLES) {
    let outcome;
    try {
      outcome = await restGet(`${table}?select=*&limit=1`);
    } catch (error) {
      record(`RLS ${table}`, `lecture anonyme de ${table}`, false, `erreur réseau : ${error.message}`);
      leaked.push(table);
      continue;
    }

    if (outcome.status >= 400) {
      denied.push(`${table}(${outcome.status})`);
      continue;
    }

    let rows;
    try {
      rows = JSON.parse(outcome.text);
    } catch {
      leaked.push(`${table}(réponse illisible)`);
      record(`RLS ${table}`, `lecture anonyme de ${table}`, false, `réponse non JSON (${outcome.status})`);
      continue;
    }

    if (Array.isArray(rows) && rows.length === 0) {
      emptied.push(table);
    } else {
      leaked.push(table);
      record(
        `RLS ${table}`,
        `lecture anonyme de ${table}`,
        false,
        `${rows?.length ?? "?"} ligne(s) exposée(s) avec la clé publique`,
      );
    }
  }

  record(
    "RLS privé",
    `${PRIVATE_TABLES.length} tables privées refusées ou vides pour la clé publique`,
    leaked.length === 0,
    leaked.length === 0
      ? `${denied.length} refus HTTP, ${emptied.length} filtrage RLS (0 ligne)`
      : `fuite(s) : ${leaked.join(", ")}`,
  );
}

async function checkResellerPriceColumn() {
  const outcome = await restGet("vehicles?select=id,reseller_price&limit=1");
  const ok = outcome.status >= 400;

  record(
    "Prix Revendeur",
    "la colonne vehicles.reseller_price est inaccessible à la clé publique",
    ok,
    ok ? `HTTP ${outcome.status}` : `HTTP ${outcome.status} — la colonne est exposée`,
  );
}

async function checkPublishedOnly() {
  const outcome = await restGet("vehicles?select=id,is_published&limit=100");

  if (outcome.status >= 400) {
    record(
      "Catalogue public",
      "la clé publique ne lit que les véhicules publiés",
      true,
      `HTTP ${outcome.status} (catalogue non exposé directement au navigateur : lecture serveur)`,
    );
    return;
  }

  let rows = [];
  try {
    rows = JSON.parse(outcome.text);
  } catch {
    record("Catalogue public", "lecture du catalogue anonyme", false, "réponse non JSON");
    return;
  }

  const unpublished = rows.filter((row) => row.is_published !== true);

  record(
    "Catalogue public",
    `les ${rows.length} véhicule(s) servis anonymement sont publiés`,
    unpublished.length === 0,
    unpublished.length === 0 ? "is_published = true pour toutes les lignes" : `${unpublished.length} non publié(s) servis`,
  );
}

async function checkPrivateBucket() {
  let outcome;

  try {
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/list/vehicle-documents`, {
      method: "POST",
      headers: publicHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefix: "", limit: 10 }),
    });
    outcome = { status: response.status, text: await response.text() };
  } catch (error) {
    record("Storage privé", "bucket vehicle-documents", false, `erreur réseau : ${error.message}`);
    return;
  }

  if (outcome.status >= 400) {
    record("Storage privé", "bucket vehicle-documents non listable par la clé publique", true, `HTTP ${outcome.status}`);
    return;
  }

  let entries;
  try {
    entries = JSON.parse(outcome.text);
  } catch {
    entries = null;
  }

  const ok = Array.isArray(entries) && entries.length === 0;

  record(
    "Storage privé",
    "bucket vehicle-documents non listable par la clé publique",
    ok,
    ok ? "liste vide" : `${entries?.length ?? "?"} objet(s) exposé(s)`,
  );
}

function collectFiles(directory, extensions, limit = 20000) {
  const files = [];
  const stack = [directory];

  while (stack.length > 0 && files.length < limit) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
        files.push(full);
      }
    }
  }

  return files;
}

function scanForSecrets(files, secrets) {
  const hits = [];

  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }

    for (const [name, value] of secrets) {
      if (value && value.length >= 16 && content.includes(value)) {
        hits.push(`${file} (${name})`);
      }
    }
  }

  return hits;
}

function checkClientBundle() {
  const staticDir = join(APP_DIR, ".next", "static");

  if (!existsSync(staticDir)) {
    record("Bundle client", "clé service_role absente du bundle client", false, ".next/static absent : lancez `npm run build` d'abord");
    return;
  }

  const files = collectFiles(staticDir, [".js", ".mjs", ".json", ".map", ".txt", ".html"]);
  const secrets = [
    ["SUPABASE_SERVICE_ROLE_KEY", SECRET_KEY],
    ["DATABASE_URL", process.env.DATABASE_URL ?? ""],
  ];
  const hits = scanForSecrets(files, secrets);

  record(
    "Bundle client",
    "clé service_role et DATABASE_URL absentes du bundle client",
    hits.length === 0,
    hits.length === 0 ? `${files.length} fichier(s) client analysé(s)` : `présent dans : ${hits.join(", ")}`,
  );
}

function checkGitTrackedFiles() {
  let tracked;
  try {
    tracked = execFileSync("git", ["ls-files"], { cwd: APP_DIR, encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .map((file) => join(APP_DIR, file))
      .filter((file) => existsSync(file) && statSync(file).isFile());
  } catch (error) {
    record("Dépôt Git", "aucun secret dans les fichiers suivis", false, `git indisponible : ${error.message}`);
    return;
  }

  const secrets = [
    ["SUPABASE_SERVICE_ROLE_KEY", SECRET_KEY],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", PUBLIC_KEY],
    ["DATABASE_URL", process.env.DATABASE_URL ?? ""],
  ];
  const hits = scanForSecrets(tracked, secrets);
  const ignored = execFileSync("git", ["check-ignore", ".env.local"], { cwd: APP_DIR, encoding: "utf8" }).trim();

  const ok = hits.length === 0 && ignored === ".env.local";

  record(
    "Dépôt Git",
    "aucun secret dans les fichiers suivis et .env.local ignoré",
    ok,
    ok ? `${tracked.length} fichier(s) suivi(s) analysé(s), .env.local ignoré` : `secret(s) : ${hits.join(", ") || "aucun"} ; .env.local ignoré : ${ignored === ".env.local"}`,
  );
}

async function main() {
  console.log(`Recette de sécurité — ${SUPABASE_URL}`);
  console.log(`Clé publique : ${PUBLIC_KEY.slice(0, 8)}… (valeur tronquée, jamais journalisée en entier)\n`);

  await checkPrivateTables();
  await checkResellerPriceColumn();
  await checkPublishedOnly();
  await checkPrivateBucket();
  checkClientBundle();
  checkGitTrackedFiles();

  let failures = 0;

  for (const [index, result] of results.entries()) {
    const mark = result.ok ? "OK  " : "ÉCHEC";
    if (!result.ok) failures += 1;
    console.log(`${String(index + 1).padStart(2, " ")}. [${mark}] ${result.label} — ${result.detail}`);
  }

  console.log(`\n${results.length} contrôle(s), ${failures} échec(s).`);

  if (failures > 0) {
    process.exitCode = 1;
  }
}

await main();
