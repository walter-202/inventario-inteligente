import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname.replace(/^\/(\w):/, "$1:");
const read = (path) => readFileSync(join(root, path.replaceAll("/", "\\")), "utf8");

const authSeed = () => read("scripts/seed_auth_users.mjs");
const sqlSeed = () => read("scripts/seed_lidemoda.sql");

test("auth seed provisions two multi-branch representatives through profiles", () => {
  const source = authSeed();

  for (const email of ["marketing.lidemoda@gmail.com", "supervisora.regional@gmail.com"]) {
    assert.match(source, new RegExp(email.replaceAll(".", "\\.")));
  }
  assert.match(source, /marketing/);
  assert.match(source, /admin/);
  assert.match(source, /sucursal_id:\s*null/);
  assert.match(source, /from\("perfiles"\)\.upsert/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /SEED_AUTH_PASSWORD/);
  assert.doesNotMatch(source, /password:\s*["'`][^"'`]+["'`]/i);
  assert.doesNotMatch(source, /user_metadata\s*:\s*\{[^}]*\b(?:rol|sucursal_id)\b/i);
});

test("SQL seed keeps authorization in profiles and is safe to rerun", () => {
  const source = sqlSeed();
  const authUsersBlock = source.match(/INSERT INTO auth\.users[\s\S]*?INSERT INTO auth\.identities/iu)?.[0];

  assert.ok(authUsersBlock, "auth user insert block must remain present");
  assert.match(source, /marketing\.lidemoda@gmail\.com/);
  assert.match(source, /supervisora\.regional@gmail\.com/);
  assert.match(source, /'marketing', NULL::bigint/);
  assert.match(source, /'admin', NULL::bigint/);
  assert.match(source, /current_setting\('seed\.auth_password',\s*true\)/i);
  assert.doesNotMatch(source, /Lidemoda2026!/);
  assert.doesNotMatch(authUsersBlock, /\b(?:rol|sucursal_id)\b/i);
  assert.match(source, /ON CONFLICT \(id\) DO UPDATE/);
  assert.match(source, /ON CONFLICT \(codigo\) DO UPDATE/);
  assert.match(source, /ON CONFLICT \(producto_id, sucursal_id\) DO UPDATE/);
  assert.ok((source.match(/IF NOT EXISTS \(\s*SELECT 1 FROM public\.ventas/giu) ?? []).length >= 7);
});

test("SQL demo sales use the database current day as their relative-time anchor", () => {
  const source = sqlSeed();
  const databaseDayAnchor = /v_now\s+timestamp\s+with\s+time\s+zone\s*:=\s*date_trunc\('day',\s*now\(\)\s+at\s+time\s+zone\s+current_setting\('TIMEZONE'\)\)\s+at\s+time\s+zone\s+current_setting\('TIMEZONE'\)\s*\+\s*interval\s+'12 hours'/i;

  assert.doesNotMatch(source, /2026-09-16/);
  assert.match(source, databaseDayAnchor);
});
