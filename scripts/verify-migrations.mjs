#!/usr/bin/env node
/**
 * Diaba Auto — contrôle hors ligne des migrations M01..M07 (décision T01/T02).
 *
 * Principe : le schéma `prisma/schema.prisma` est la seule source de vérité de
 * la structure. Le SQL de structure attendu est GÉNÉRÉ par Prisma :
 *
 *   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
 *
 * Le script reconstruit la structure EFFECTIVE produite par les migrations
 * M01..M04 + M07 (partie structurelle) en repliant les instructions dans
 * l'ordre : CREATE TABLE, ALTER TABLE … ADD COLUMN, ADD CONSTRAINT, mais aussi
 * les RENOMMAGES (ALTER TABLE … RENAME TO, RENAME COLUMN, RENAME CONSTRAINT,
 * ALTER INDEX … RENAME TO). La structure reconstruite est comparée au schéma
 * attendu : AUCUN objet (enum, table, colonne, index, clé étrangère) du schéma
 * ne doit manquer, et aucun type de colonne ne doit diverger.
 *
 * La comparaison est normalisée : espaces, majuscules et commentaires `--` ignorés.
 *
 * Renommages explicitement pris en charge (contrat lot 5 §2) :
 *   * table   custom_requests  -> custom_vehicle_requests
 *   * colonne leads.first_name -> leads.name
 *
 * Aucune base de données n'est contactée. Aucune dépendance externe.
 *
 * Sortie : résumé lisible + code de sortie 1 si un écart est détecté.
 *
 * Usage : node scripts/verify-migrations.mjs
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, '..');
const MIGRATIONS_DIR = join(ROOT, 'prisma', 'migrations');

const MIGRATION_DIR_RE = /^(\d{14})_(m\d{2}_[a-z0-9_]+)$/;
const EXPECTED_NAMES = ['m01_identite', 'm02_referentiels', 'm03_activite_client', 'm04_journaux_audit_index', 'm05_rls_storage', 'm06_integrite_profils_auth', 'm07_crm_revendeur'];
const STRUCTURAL = ['m01_identite', 'm02_referentiels', 'm03_activite_client', 'm04_journaux_audit_index', 'm07_crm_revendeur'];

const failures = [];
const notes = [];
const fail = (m) => failures.push(m);
const ok = (m) => notes.push(m);

// ---------------------------------------------------------------------------
// Normalisation : espaces + casse (les commentaires sont retirés par le
// découpage ci-dessous, sans risque pour les littéraux contenant « -- »).
// ---------------------------------------------------------------------------
const normalize = (sql) => sql.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Découpe un script SQL en instructions, en ignorant les commentaires et en
 * respectant les littéraux '…', les identifiants "…" et les corps $tag$…$tag$.
 */
function splitStatements(sql) {
  const out = [];
  let cur = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    // commentaire de ligne
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      cur += ' ';
      continue;
    }
    // commentaire de bloc
    if (ch === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      cur += ' ';
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      cur += ch;
      i++;
      while (i < sql.length) {
        cur += sql[i];
        if (sql[i] === quote) {
          if (quote === "'" && sql[i + 1] === "'") {
            cur += sql[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? sql.length : end + tag.length;
        cur += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (ch === ';') {
      out.push(cur);
      cur = '';
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// 1. Inventaire du dossier de migrations
// ---------------------------------------------------------------------------
function readMigrations() {
  if (!existsSync(MIGRATIONS_DIR)) throw new Error(`dossier absent : ${MIGRATIONS_DIR}`);
  const entries = readdirSync(MIGRATIONS_DIR)
    .filter((e) => statSync(join(MIGRATIONS_DIR, e)).isDirectory())
    .map((name) => {
      const m = name.match(MIGRATION_DIR_RE);
      if (!m) throw new Error(`nom de dossier de migration invalide : « ${name} » (attendu <AAAAMMJJHHMMSS>_m0X_<nom>)`);
      return { dir: name, timestamp: m[1], label: m[2] };
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const found = entries.map((e) => e.label);
  for (const want of EXPECTED_NAMES) {
    if (!found.includes(want)) fail(`migration manquante : ${want}`);
  }
  for (let i = 1; i < entries.length; i++) {
    if (entries[i - 1].timestamp >= entries[i].timestamp) {
      fail(`horodatages non strictement croissants : ${entries[i - 1].dir} puis ${entries[i].dir}`);
    }
  }
  const wantedOrder = entries.filter((e) => EXPECTED_NAMES.includes(e.label)).map((e) => e.label);
  if (wantedOrder.join(',') !== EXPECTED_NAMES.filter((n) => found.includes(n)).join(',')) {
    fail(`ordre des migrations incorrect : ${wantedOrder.join(' -> ')}`);
  }

  for (const e of entries) {
    const file = join(MIGRATIONS_DIR, e.dir, 'migration.sql');
    if (!existsSync(file)) {
      fail(`migration.sql absent dans ${e.dir}`);
      continue;
    }
    e.sql = readFileSync(file, 'utf8');
    if (!e.sql.trim()) fail(`migration.sql vide dans ${e.dir}`);
    if (e.label.startsWith('m0') && !/--\s*Diaba Auto - M0\d/.test(e.sql)) {
      fail(`en-tête de migration absent dans ${e.dir}/migration.sql`);
    }
  }
  return { entries, found };
}

function readLockFile() {
  const lock = join(MIGRATIONS_DIR, 'migration_lock.toml');
  if (!existsSync(lock)) {
    fail('prisma/migrations/migration_lock.toml absent');
    return;
  }
  const txt = readFileSync(lock, 'utf8');
  const m = txt.match(/^\s*provider\s*=\s*"([^"]+)"/m);
  if (!m) fail('migration_lock.toml : clé « provider » absente');
  else if (m[1] !== 'postgresql') fail(`migration_lock.toml : provider = "${m[1]}" (attendu "postgresql")`);
  else ok('migration_lock.toml : provider = "postgresql"');
}

// ---------------------------------------------------------------------------
// 2. SQL attendu, généré par Prisma
// ---------------------------------------------------------------------------
function prismaDiffScript() {
  const args = ['migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'];
  const local = join(ROOT, 'node_modules', '.bin', 'prisma');
  const cmd = existsSync(local) ? local : 'npx';
  const argv = existsSync(local) ? args : ['--no-install', 'prisma', ...args];
  try {
    return execFileSync(cmd, argv, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    throw new Error(
      `échec de « prisma migrate diff » (${cmd} ${argv.join(' ')})\n${err.stderr || err.message}`
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Modèle structurel effectif : repli (fold) des instructions SQL
// ---------------------------------------------------------------------------
/** Colonnes d'un corps de CREATE TABLE (découpage respectant les parenthèses). */
function parseColumns(body) {
  const cols = new Map();
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur);

  for (const line of parts) {
    const t = line.trim();
    const c = t.match(/^"([^"]+)"\s+(.+)$/);
    if (c && !/^(constraint|primary|foreign|unique|check)\b/.test(c[1])) {
      cols.set(c[1], normalize(t));
    }
  }
  return cols;
}

const TABLE_REF = '(?:public\\.)?(?:"([^"]+)"|([a-z0-9_]+))';
const tableRef = (s) => {
  const m = s.match(new RegExp(`^alter table ${TABLE_REF}`));
  return m ? m[1] || m[2] : null;
};

function renameTable(model, oldName, newName) {
  if (model.tables.has(oldName)) {
    model.tables.set(newName, model.tables.get(oldName));
    model.tables.delete(oldName);
  }
  const qOld = `"${oldName}"`;
  const qNew = `"${newName}"`;
  for (const [k, v] of [...model.indexes]) if (v.includes(qOld)) model.indexes.set(k, v.split(qOld).join(qNew));
  for (const [k, v] of [...model.fks]) if (v.includes(qOld)) model.fks.set(k, v.split(qOld).join(qNew));
}

function renameColumn(model, table, oldCol, newCol) {
  const cols = model.tables.get(table);
  if (!cols || !cols.has(oldCol)) return;
  const def = cols.get(oldCol).split(`"${oldCol}"`).join(`"${newCol}"`);
  cols.delete(oldCol);
  cols.set(newCol, def);
}

function renameConstraint(model, oldName, newName) {
  const q0 = `"${oldName}"`;
  const q1 = `"${newName}"`;
  if (model.fks.has(oldName)) {
    model.fks.set(newName, model.fks.get(oldName).split(q0).join(q1));
    model.fks.delete(oldName);
  }
  if (model.checks.has(oldName)) {
    model.checks.delete(oldName);
    model.checks.add(newName);
  }
}

function renameIndex(model, oldName, newName) {
  if (!model.indexes.has(oldName)) return;
  model.indexes.set(newName, model.indexes.get(oldName).split(`"${oldName}"`).join(`"${newName}"`));
  model.indexes.delete(oldName);
}

/** Applique UNE instruction normalisée au modèle structurel. */
function applyStatement(model, s) {
  let m;
  if ((m = s.match(/^create type "([^"]+)" as enum/))) {
    model.enums.add(m[1]);
    return;
  }
  if ((m = s.match(/^create table "([^"]+)"\s*\((.*)\)$/))) {
    model.tables.set(m[1], parseColumns(m[2]));
    return;
  }
  if ((m = s.match(/^create (?:unique )?index (?:if not exists )?"([^"]+)"/))) {
    model.indexes.set(m[1], s);
    return;
  }
  if ((m = s.match(new RegExp(`^alter table ${TABLE_REF} rename to (?:"([^"]+)"|([a-z0-9_]+))$`)))) {
    renameTable(model, m[1] || m[2], m[3] || m[4]);
    return;
  }
  if ((m = s.match(new RegExp(`^alter table ${TABLE_REF} rename column "([^"]+)" to "([^"]+)"$`)))) {
    renameColumn(model, m[1] || m[2], m[3], m[4]);
    return;
  }
  if ((m = s.match(new RegExp(`^alter table ${TABLE_REF} rename constraint "([^"]+)" to "([^"]+)"$`)))) {
    renameConstraint(model, m[3], m[4]);
    return;
  }
  if ((m = s.match(new RegExp(`^alter index ${TABLE_REF} rename to "([^"]+)"$`)))) {
    renameIndex(model, m[1] || m[2], m[3]);
    return;
  }
  if ((m = s.match(new RegExp(`^alter table ${TABLE_REF} add column "([^"]+)" (.+)$`)))) {
    const table = m[1] || m[2];
    const col = m[3];
    if (!model.tables.has(table)) model.tables.set(table, new Map());
    model.tables.get(table).set(col, `"${col}" ${m[4]}`);
    return;
  }
  // Contraintes : un ALTER peut en porter plusieurs (CHECK notamment).
  const table = tableRef(s);
  if (table) {
    for (const fk of s.matchAll(/add constraint "([^"]+)" foreign key/g)) model.fks.set(fk[1], s);
    for (const ck of s.matchAll(/add constraint "([^"]+)" check/g)) model.checks.add(ck[1]);
  }
}

/** Construit le modèle structurel effectif à partir d'un script SQL. */
function modelFromSql(sql) {
  const model = { enums: new Set(), tables: new Map(), indexes: new Map(), fks: new Map(), checks: new Set() };
  for (const s of splitStatements(sql).map(normalize)) applyStatement(model, s);
  return model;
}

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------
function main() {
  console.log('Diaba Auto — vérification des migrations M01..M07 (hors ligne)');
  console.log('  schéma source : prisma/schema.prisma');
  console.log('');

  const { entries } = readMigrations();
  readLockFile();

  const diffSql = prismaDiffScript();
  const expected = modelFromSql(diffSql);

  const structureEntries = entries.filter((e) => STRUCTURAL.includes(e.label));
  const migratedSql = structureEntries.map((e) => e.sql).join('\n\n');
  const migrated = modelFromSql(migratedSql);

  // --- 3a. enums, tables, index, clés étrangères du schéma -----------------
  const missingEnums = [...expected.enums].filter((e) => !migrated.enums.has(e));
  for (const e of missingEnums) fail(`ENUM du schéma absent des migrations : ${e}`);

  const missingTables = [...expected.tables.keys()].filter((t) => !migrated.tables.has(t));
  for (const t of missingTables) fail(`TABLE du schéma absente des migrations : ${t}`);

  const missingIndexes = [...expected.indexes.keys()].filter((i) => !migrated.indexes.has(i));
  for (const i of missingIndexes) fail(`INDEX du schéma absent des migrations : ${i}`);

  const missingFks = [];
  const divergentFks = [];
  for (const [name, stmt] of expected.fks) {
    if (!migrated.fks.has(name)) missingFks.push(name);
    else if (migrated.fks.get(name) !== stmt) divergentFks.push(name);
  }
  for (const n of missingFks) fail(`FK du schéma absente des migrations : ${n}`);
  for (const n of divergentFks) fail(`FK du schéma divergente dans les migrations : ${n}`);

  // --- 3b. colonnes : contrôle explicite (détecte une perte partielle) -----
  const missingColumns = [];
  const divergentColumns = [];
  for (const [table, cols] of expected.tables) {
    const migratedCols = migrated.tables.get(table);
    if (!migratedCols) continue; // table déjà signalée
    for (const [col, def] of cols) {
      if (!migratedCols.has(col)) missingColumns.push(`${table}.${col}`);
      else if (migratedCols.get(col) !== def) divergentColumns.push(`${table}.${col}`);
    }
  }
  for (const c of missingColumns) fail(`COLONNE du schéma absente des migrations : ${c}`);
  for (const c of divergentColumns) fail(`COLONNE du schéma divergente dans les migrations : ${c}`);

  // --- 3c. M05/M07 : RLS obligatoire sur toutes les tables exposées --------
  const m05 = entries.find((e) => e.label === 'm05_rls_storage');
  const m07 = entries.find((e) => e.label === 'm07_crm_revendeur');
  const rlsText = [m05, m07].filter(Boolean).map((e) => splitStatements(e.sql).map(normalize).join('\n')).join('\n');
  if (!m05) {
    fail('M05 absente : RLS et policies non vérifiables');
  } else {
    const m05Text = normalize(m05.sql);
    // La RLS peut être activée en M05 (tables historiques) ou en M07 (tables/renommages du lot 5).
    const tablesWithoutRls = expected.tables
      ? [...expected.tables.keys()].filter((t) => !rlsText.includes(`alter table public.${t} enable row level security`))
      : [];
    for (const t of tablesWithoutRls) fail(`RLS non activée (M05/M07) pour la table « ${t} »`);

    const buckets = [...m05Text.matchAll(/insert into storage\.buckets/g)].length;
    if (buckets !== 1) fail(`M05 : INSERT INTO storage.buckets attendu une fois (trouvé ${buckets})`);
    for (const b of ['vehicle-images', 'vehicle-documents', 'avatars', 'app-assets']) {
      if (!m05Text.includes(`('${b}'`)) fail(`M05 : bucket Storage « ${b} » absent`);
    }
    if (!m05Text.includes('create or replace function public.handle_new_auth_user')) {
      fail('M05 : fonction public.handle_new_auth_user() absente');
    }
    if (!m05Text.includes('create or replace function public.repair_orphan_profiles')) {
      fail('M05 : fonction public.repair_orphan_profiles() absente');
    }
    if (!m05Text.includes('after insert on auth.users')) {
      fail('M05 : trigger de liaison auth.users absent');
    }
    if (!m05Text.includes('create or replace function public.current_profile_id')) {
      fail('M05 : fonction helper public.current_profile_id() absente');
    }
    if (!m05Text.includes('security definer')) {
      fail('M05 : aucune fonction SECURITY DEFINER (helper RLS)');
    }
  }

  // --- 3d. M04 : contraintes CHECK, index complémentaires, audit append-only
  const m04 = entries.find((e) => e.label === 'm04_journaux_audit_index');
  if (!m04) {
    fail('M04 absente : CHECK, index complémentaires et audit append-only non vérifiables');
  } else {
    const m04Text = normalize(m04.sql);
    const expectedChecks = [
      'vehicle_prices_base_amount_non_negative',
      'vehicle_prices_transport_amount_non_negative',
      'vehicle_prices_validity_range',
      'orders_agreed_price_non_negative',
      'custom_requests_budget_min_non_negative',
      'custom_requests_budget_max_non_negative',
      'custom_requests_budget_range',
    ];
    for (const c of expectedChecks) if (!m04Text.includes(c)) fail(`M04 : contrainte CHECK « ${c} » absente (T04)`);
    for (const idx of [
      'staff_roles_role_id_idx',
      'leads_customer_id_idx',
      'leads_vehicle_id_idx',
      'orders_vehicle_id_idx',
      'custom_requests_customer_id_idx',
      'audit_logs_actor_profile_id_idx',
      'vehicles_published_at_idx',
      'vehicle_trims_generation_id_idx',
      'vehicles_generation_id_idx',
      'vehicles_trim_id_idx',
      'vehicles_fuel_type_id_idx',
      'vehicles_transmission_type_id_idx',
      'vehicles_body_type_id_idx',
      'vehicles_exterior_color_id_idx',
      'vehicles_interior_color_id_idx',
      'vehicle_features_feature_definition_id_idx',
      'vehicle_options_option_id_idx',
    ]) {
      if (!m04Text.includes(idx)) fail(`M04 : index « ${idx} » absent (T06)`);
    }
    // Les colonnes de prix ont quitté `vehicles` (décision D10) : ces colonnes
    // ne doivent plus apparaître du tout dans le code de M04 (aucun CHECK de montant).
    const m04Code = splitStatements(m04.sql).map(normalize).join('\n');
    if (/(public_price|reseller_price)/.test(m04Code)) {
      fail('M04 : référence à public_price/reseller_price de « vehicles » : colonnes supprimées (D10)');
    }
    if (!/where is_published = true/.test(m04Text)) fail('M04 : index partiel catalogue (WHERE is_published = true) absent (T06)');
    if (!m04Text.includes('revoke update, delete')) fail('M04 : REVOKE UPDATE, DELETE sur audit_logs absent (T05)');
    if (!/before update or delete on public\.audit_logs/.test(m04Text)) fail('M04 : trigger append-only sur audit_logs absent (T05)');
  }

  // --- 3e. M05 : contrôle de moindre privilège des policies -------------------
  if (m05) {
    const m05Text = normalize(m05.sql);
    const policyRe = /create policy ([a-z0-9_]+) on (?:public|storage)\.([a-z0-9_]+)(?: for (select|insert|update|delete|all))?/g;
    const byTable = new Map();
    for (const m of m05Text.matchAll(policyRe)) {
      const [, , table, cmd = 'all'] = m;
      if (!byTable.has(table)) byTable.set(table, new Set());
      const cmds = cmd === 'all' ? ['select', 'insert', 'update', 'delete'] : [cmd];
      for (const c of cmds) byTable.get(table).add(c);
    }
    const cmdsOf = (t) => byTable.get(t) || new Set();
    const has = (t, ...cs) => cs.every((c) => cmdsOf(t).has(c));
    const only = (t, ...cs) => cmdsOf(t).size === cs.length && cs.every((c) => cmdsOf(t).has(c));

    // refus par défaut : aucune policy client sur ces tables
    const defaultDeny = [
      'staff_profiles', 'staff_roles', 'roles', 'permissions', 'role_permissions', 'audit_logs',
      'brands', 'vehicle_models', 'vehicle_documents', 'order_events',
      'vehicle_generations', 'vehicle_trims', 'body_types', 'fuel_types', 'transmission_types',
      'colors', 'option_categories', 'options', 'feature_definitions',
      'vehicle_features', 'vehicle_options',
      'vehicle_prices', 'exchange_rates', 'price_history',
    ];
    for (const t of defaultDeny) {
      if (cmdsOf(t).size) fail(`M05 : policy client inattendue sur « ${t} » (${[...cmdsOf(t)].join(', ')}) — refus par défaut attendu`);
      // refus par défaut = aucun privilège de table non plus (le serveur seul lit/écrit).
      const grantRe = new RegExp(`grant [^;]* on public\\.${t}\\b`);
      if (grantRe.test(m05Text)) fail(`M05 : GRANT sur « ${t} » interdit — refus par défaut attendu (aucun GRANT client)`);
    }
    // catalogue public : SELECT seulement
    if (!only('vehicles', 'select')) fail(`M05 : « vehicles » doit n'accorder que SELECT (obtenu : ${[...cmdsOf('vehicles')].join(', ') || 'aucune policy'})`);
    if (!only('vehicle_media', 'select')) fail(`M05 : « vehicle_media » doit n'accorder que SELECT (obtenu : ${[...cmdsOf('vehicle_media')].join(', ') || 'aucune policy'})`);
    // lignes propres : lecture seule pour leads/orders/custom_requests
    // NB : `leads` est ensuite basculé en accès serveur uniquement par M07 (§3f) ; le présent
    // contrôle porte sur l'état de M05, qui reste la référence historique de la policy.
    for (const t of ['leads', 'orders', 'custom_requests']) {
      if (!only(t, 'select')) fail(`M05 : « ${t} » doit n'accorder que SELECT de ses lignes (obtenu : ${[...cmdsOf(t)].join(', ') || 'aucune policy'})`);
    }
    // favoris et recherches : CRUD complet de ses lignes
    for (const t of ['favorite_vehicles', 'saved_searches']) {
      if (!has(t, 'select', 'insert', 'update', 'delete')) fail(`M05 : « ${t} » doit accorder SELECT/INSERT/UPDATE/DELETE de ses lignes`);
    }
    // profil : lecture de sa ligne ; profil client : lecture + mise à jour
    if (!only('profiles', 'select')) fail(`M05 : « profiles » doit n'accorder que SELECT de sa ligne`);
    if (!has('customer_profiles', 'select', 'update') || cmdsOf('customer_profiles').has('delete')) {
      fail('M05 : « customer_profiles » doit accorder SELECT et UPDATE (sans DELETE) sur sa ligne');
    }
    // colonnes sensibles non modifiables : aucun GRANT UPDATE sur userType/status/resellerStatus
    const grantUpdateRe = /grant update \(([^)]*)\) on public\.([a-z0-9_]+)/g;
    const grantedUpdate = new Map();
    for (const m of m05Text.matchAll(grantUpdateRe)) {
      grantedUpdate.set(m[2], new Set(m[1].split(',').map((s) => s.trim().replace(/"/g, ''))));
    }
    const blocked = ['user_type', 'status', 'reseller_status', 'profile_id', 'pricing_profile', 'customer_segment'];
    for (const [table, cols] of grantedUpdate) {
      for (const c of blocked) {
        if (cols.has(c)) fail(`M05 : GRANT UPDATE sur ${table}.${c} interdit (champ protégé)`);
      }
    }
    if (!grantedUpdate.has('customer_profiles')) {
      fail('M05 : aucun GRANT UPDATE colonne par colonne sur customer_profiles');
    }
    // Catalogue public : aucun GRANT SELECT global sur « vehicles » (il exposerait
    // les colonnes internes — sourcing fournisseur, provenance — malgré RLS, qui
    // filtre des lignes et non des colonnes ; et `public_price`/`reseller_price`
    // n'existent plus sur cette table depuis la décision D10).
    if (/grant select on public\.vehicles\b/.test(m05Text)) {
      fail('M05 : GRANT SELECT global sur « vehicles » interdit (exposerait les colonnes internes)');
    }
    const vehiclesColumnGrants = [...m05Text.matchAll(/grant select \(([^)]*)\) on public\.vehicles\b/g)];
    if (!vehiclesColumnGrants.length) {
      fail('M05 : GRANT SELECT colonne par colonne absent sur « vehicles »');
    } else {
      // Toutes les attributions de colonnes sont contrôlées (une attribution
      // supplémentaire ne doit pas pouvoir contourner l'exclusion).
      const union = new Set();
      for (const m of vehiclesColumnGrants) {
        const cols = m[1].split(',').map((s) => s.trim().replace(/"/g, ''));
        for (const c of cols) {
          union.add(c);
          for (const forbidden of ['reseller_price', 'public_price', 'supplier_reference', 'supplier_name', 'source_url', 'eligibility_status']) {
            if (c === forbidden) {
              fail(`M05 : GRANT SELECT sur vehicles.${forbidden} interdit (colonne interne/serveur)`);
            }
          }
        }
      }
      for (const expectedCol of ['reference', 'slug', 'title', 'brand_id', 'model_id', 'condition', 'year', 'logistics_location', 'commercial_status', 'is_published']) {
        if (!union.has(expectedCol)) {
          fail(`M05 : GRANT SELECT sur vehicles.${expectedCol} attendu (colonne publique du catalogue)`);
        }
      }
      // Fermeture : tout autre GRANT visant « vehicles » (forme globale, table
      // quotée, colonnes + rôle, etc.) est refusé — seul le GRANT colonne par
      // colonne en SELECT est admis.
      for (const stmt of splitStatements(m05.sql).map(normalize)) {
        if (!/^grant\b/.test(stmt)) continue;
        if (!/public\.("?)vehicles?\1\b/.test(stmt) && !/\bvehicles\b/.test(stmt)) continue;
        if (!/^grant select \([^)]*\) on public\.("?)vehicles?\1( to [a-z0-9_,\s]+)?$/.test(stmt)) {
          fail(`M05 : GRANT non conforme sur « vehicles » (seul GRANT SELECT colonne par colonne est admis) : ${stmt.slice(0, 80)}`);
        }
      }
    }
    // storage : au moins une policy sur storage.objects
    if (!byTable.get('objects')?.size) {
      fail('M05 : aucune policy sur storage.objects');
    }
  }

  // --- 3f. M07 : renommages, RLS serveur-only et invariant « demande ouverte » -
  if (!m07) {
    fail('M07 absente : renommages, RLS et invariants du lot 5 non vérifiables');
  } else {
    const m07Text = splitStatements(m07.sql).map(normalize).join('\n');

    // Renommages prescrits (contrat §2.3 / §2.1).
    if (!/alter table public\.custom_requests rename to custom_vehicle_requests/.test(m07Text)) {
      fail('M07 : renommage de table custom_requests -> custom_vehicle_requests absent');
    }
    if (!/alter table public\.leads rename column "first_name" to "name"/.test(m07Text)) {
      fail('M07 : renommage de colonne leads.first_name -> name absent');
    }

    // RLS activée sur les tables nouvelles / renommées (§2.4).
    for (const t of ['leads', 'custom_vehicle_requests', 'reseller_applications', 'lead_notes', 'lead_activities']) {
      if (!m07Text.includes(`alter table public.${t} enable row level security`)) {
        fail(`M07 : RLS non activée pour « ${t} »`);
      }
    }

    // Accès serveur uniquement : aucun GRANT ni policy client sur les tables CRM / Revendeur.
    for (const t of ['leads', 'lead_notes', 'lead_activities', 'reseller_applications']) {
      if (new RegExp(`grant [^;]* on (?:public\\.)?"?${t}"?\\b`).test(m07Text)) {
        fail(`M07 : GRANT client interdit sur « ${t} » (accès serveur uniquement)`);
      }
      if (new RegExp(`create policy [a-z0-9_]+ on (?:public\\.)?"?${t}"?\\b`).test(m07Text)) {
        fail(`M07 : policy client inattendue sur « ${t} » (accès serveur uniquement)`);
      }
    }
    // `leads` : la policy M05 et le privilège client sont retirés.
    if (!/drop policy if exists leads_select_own on public\.leads/.test(m07Text)) {
      fail('M07 : la policy client leads_select_own (M05) doit être retirée');
    }
    if (!/revoke all on public\.leads from anon, authenticated/.test(m07Text)) {
      fail('M07 : les privilèges client sur « leads » doivent être révoqués');
    }
    // `custom_vehicle_requests` : privilèges CONSERVÉS (aucun REVOKE, aucun nouveau GRANT).
    if (/revoke [^;]* on public\.custom_vehicle_requests/.test(m07Text)) {
      fail('M07 : les privilèges client de custom_vehicle_requests doivent être CONSERVÉS (aucun REVOKE)');
    }
    if (/grant [^;]* on public\.custom_vehicle_requests/.test(m07Text)) {
      fail('M07 : aucun nouveau GRANT attendu sur custom_vehicle_requests (privilèges conservés)');
    }

    // Invariant corpus « une demande ouverte maximum » (contrat §2.2).
    if (!/unique index "reseller_applications_one_open_per_customer_idx"[^;]*where status in \('pending', 'under_review'\)/.test(m07Text)) {
      fail('M07 : index unique partiel « une demande ouverte maximum » absent');
    }

    // Contraintes CHECK de cohérence (budgets leads, plage d'années des demandes).
    for (const c of [
      'leads_budget_min_non_negative',
      'leads_budget_max_non_negative',
      'leads_budget_range',
      'custom_vehicle_requests_year_range',
    ]) {
      if (!m07Text.includes(c)) fail(`M07 : contrainte CHECK « ${c} » absente`);
    }

    ok('M07 : renommages, RLS serveur-only et invariants vérifiés');
  }

  // --- 4. résumé -----------------------------------------------------------
  const perMigration = entries
    .filter((e) => EXPECTED_NAMES.includes(e.label))
    .map((e) => ({ label: e.label, dir: e.dir, n: splitStatements(e.sql).length }));

  const gap = missingEnums.length + missingTables.length + missingColumns.length + divergentColumns.length + missingIndexes.length + missingFks.length + divergentFks.length;

  console.log(`  Schéma attendu (prisma migrate diff) : ${expected.enums.size} enums | ${expected.tables.size} tables | ${[...expected.tables.values()].reduce((n, c) => n + c.size, 0)} colonnes | ${expected.indexes.size} index | ${expected.fks.size} clés étrangères`);
  console.log(`  Structure effective M01..M04 + M07    : ${migrated.enums.size} enums | ${migrated.tables.size} tables | ${[...migrated.tables.values()].reduce((n, c) => n + c.size, 0)} colonnes | ${migrated.indexes.size} index | ${migrated.fks.size} clés étrangères`);
  console.log('');
  console.log('  Détail par migration (instructions) :');
  for (const m of perMigration) {
    const scope = STRUCTURAL.includes(m.label)
      ? 'structure + complément'
      : m.label === 'm06_integrite_profils_auth'
        ? 'Intégrité profils/Auth (manuel)'
        : 'RLS / Storage (manuel)';
    console.log(`    ${m.dir.padEnd(42)} ${String(m.n).padStart(4)}  (${scope})`);
  }
  console.log('');
  if (notes.length) {
    for (const n of notes) console.log(`  [ok] ${n}`);
  }
  console.log(`  ÉCART = ${gap} objet(s) du schéma absent(s)/divergent(s) dans la structure effective`);

  if (failures.length) {
    console.error('');
    console.error('ÉCHEC — anomalies détectées :');
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('');
  console.log('OK — aucune perte de structure : l’union M01..M07 couvre intégralement le schéma');
  console.log('     (renommages table custom_requests -> custom_vehicle_requests et colonne');
  console.log('     leads.first_name -> name pris en compte), M05/M07 activent la RLS sur toutes');
  console.log('     les tables exposées, et M07 pose les invariants du lot 5.');
  process.exit(0);
}

try {
  main();
} catch (err) {
  console.error(`ERREUR : ${err.message}`);
  process.exit(2);
}
