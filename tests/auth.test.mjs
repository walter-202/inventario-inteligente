import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { loadTsModule } from "./load-ts.mjs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/(\w):/, "$1:");

test("role policy keeps admin purely analytical with user management and confines staff to their branch", () => {
  const { branchScopeFor, can, canUseBranch } = loadTsModule("src/features/auth/lib/permissions.ts");

  // Admin has NO operational mutation abilities (purely analytical + user governance)
  assert.equal(branchScopeFor("admin", "sales.write"), "none");
  assert.equal(branchScopeFor("admin", "inventory.write"), "none");
  assert.equal(branchScopeFor("admin", "products.write"), "none");
  assert.equal(branchScopeFor("admin", "movements.write"), "none");
  assert.equal(branchScopeFor("admin", "dashboard.read"), "any");
  assert.equal(branchScopeFor("admin", "inventory.read"), "any");
  assert.equal(branchScopeFor("admin", "users.manage"), "any");
  assert.equal(can("admin", "sales.write"), false);
  assert.equal(can("admin", "users.manage"), true);

  // Operational roles maintain their branch-scoped mutations
  assert.equal(branchScopeFor("vendedora", "sales.write"), "own");
  assert.equal(branchScopeFor("reponedora", "sales.write"), "none");
  assert.equal(branchScopeFor("marketing", "dashboard.read"), "aggregate");
  assert.equal(can(undefined, "sales.write"), false);
  assert.equal(canUseBranch("vendedora", "sales.write", 2, 1), false);
  assert.equal(canUseBranch("vendedora", "sales.write", 1, 1), true);
  assert.equal(canUseBranch("admin", "dashboard.read", 2, null), true);
  assert.equal(canUseBranch("admin", "sales.write", 2, null), false);
});

test("session sync controller rejects stale profile installs after a user switch", () => {
  const { createSessionSyncController } = loadTsModule("src/features/auth/lib/authState.ts");
  const controller = createSessionSyncController();
  const first = controller.begin("user-a");
  const second = controller.begin("user-b");

  assert.equal(controller.isCurrent(first), false);
  assert.equal(controller.isCurrent(second), true);
  controller.reset();
  assert.equal(controller.isCurrent(second), false);
});

test("the auth rollout is fail-closed and contains no credential provisioning", () => {
  const sql = readFileSync(join(root, "scripts", "auth-v1-rollout.sql"), "utf8");
  assert.match(sql, /AUTH_V1_PREFLIGHT_ABORT/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.registrar_venta/);
  assert.match(sql, /private\.require_actor/);
  assert.match(sql, /CREATE POLICY perfiles_select_self_or_admin/);
  assert.doesNotMatch(sql, /password\s*[:=]\s*['"][^'"]+['"]/i);
});
