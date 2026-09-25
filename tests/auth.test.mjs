import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { loadTsModule } from "./load-ts.mjs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/(\w):/, "$1:");

test("role policy keeps admin purely analytical with user management and confines staff to their branch", () => {
  const { branchScopeFor, can, canUseBranch, canSelectBranch, assignedBranchIds } = loadTsModule("src/features/auth/lib/permissions.ts");

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
  assert.equal(canUseBranch("vendedora", "sales.write", 2, 1, [1, 2]), true);
  assert.equal(canUseBranch("vendedora", "sales.write", 3, 1, [1, 2]), false);
  assert.equal(canSelectBranch("vendedora", [1]), false);
  assert.equal(canSelectBranch("vendedora", [1, 2]), true);
  assert.equal(canSelectBranch("admin", []), true);
  assert.deepEqual(assignedBranchIds(1, null), [1]);
  assert.deepEqual(assignedBranchIds(1, []), [1]);
  assert.deepEqual(assignedBranchIds(1, [1, 2]), [1, 2]);
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

test("same-user profile revalidation keeps the ready route state and flags protected content for covering", () => {
  const { prepareProfileSyncState } = loadTsModule("src/features/auth/lib/authState.ts");
  const profile = {
    id: "user-a",
    email: "a@example.com",
    nombre: "A",
    rol: "vendedora",
    sucursal_id: 1,
    sucursal_ids: [1],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  const session = { user: { id: "user-a" } };
  const readyState = {
    status: "ready",
    session,
    profile,
    error: null,
    blockedReason: null,
    isRevalidating: false,
  };

  const revalidation = prepareProfileSyncState(readyState, session, true);
  assert.equal(revalidation.status, "ready");
  assert.equal(revalidation.profile, profile);
  assert.equal(revalidation.isRevalidating, true);

  const initialResolution = prepareProfileSyncState(
    { status: "loading", session: null, profile: null, error: null, blockedReason: null, isRevalidating: false },
    session,
    false,
  );
  assert.equal(initialResolution.status, "loading");
  assert.equal(initialResolution.profile, null);
  assert.equal(initialResolution.isRevalidating, false);

  const identityChange = prepareProfileSyncState(readyState, { user: { id: "user-b" } }, false);
  assert.equal(identityChange.status, "loading");
  assert.equal(identityChange.profile, null);
  assert.equal(identityChange.isRevalidating, false);

  const sessionAfterSignOut = prepareProfileSyncState(readyState, session, false);
  assert.equal(sessionAfterSignOut.status, "loading");
  assert.equal(sessionAfterSignOut.profile, null);
});

test("user admin RPCs fall back to legacy signatures when multi-branch migration is missing", () => {
  const source = readFileSync(join(root, "src/features/auth/api/usersApi.ts"), "utf8");
  assert.match(source, /isMissingMultiBranchRpc/);
  assert.match(source, /admin_crear_usuario/);
  assert.match(source, /p_sucursal_ids: isGlobalRole\(params\.rol\) \? null : params\.sucursalIds/);
  assert.match(source, /assertLegacySingleBranchSupported/);
});

test("refreshed role or branch changes invalidate the authorization scope", () => {
  const { hasAuthorizationScopeChanged } = loadTsModule("src/features/auth/lib/authState.ts");
  const profile = { id: "user-a", rol: "vendedora", sucursal_id: 1, sucursal_ids: [1] };

  assert.equal(hasAuthorizationScopeChanged(profile, { ...profile }), false);
  assert.equal(hasAuthorizationScopeChanged(profile, { ...profile, rol: "admin" }), true);
  assert.equal(hasAuthorizationScopeChanged(profile, { ...profile, sucursal_id: 2 }), true);
  assert.equal(hasAuthorizationScopeChanged(profile, { ...profile, sucursal_ids: [1, 2] }), true);
  assert.equal(hasAuthorizationScopeChanged(profile, { ...profile, id: "user-b" }), true);
  assert.equal(hasAuthorizationScopeChanged(null, { ...profile }), true);
});

test("authorization-scope reset clears single and batch pending sales and notifies mounted sales drafts", () => {
  const pendingSales = loadTsModule("src/features/ventas/lib/pendienteVenta.ts");
  const product = { id: 10, nombre: "P1", codigo: "SKU-10", categoria: "Ropa", precio: 100, cantidad: 50 };
  let resetCount = 0;

  assert.equal(typeof pendingSales.clearAuthorizationScopedSalesState, "function");
  assert.equal(typeof pendingSales.subscribeAuthorizationScopeReset, "function");
  pendingSales.limpiarProductoPendiente();
  pendingSales.limpiarLotePendiente();
  pendingSales.establecerProductoPendiente(product);
  pendingSales.establecerLotePendiente([{ producto: product, cantidad: 2 }]);
  const unsubscribe = pendingSales.subscribeAuthorizationScopeReset(() => { resetCount += 1; });

  pendingSales.clearAuthorizationScopedSalesState();

  assert.equal(pendingSales.peekProductoPendiente(), null);
  assert.deepEqual(pendingSales.peekLotePendiente(), []);
  assert.equal(resetCount, 1);
  unsubscribe();
  pendingSales.clearAuthorizationScopedSalesState();
  assert.equal(resetCount, 1);

  const salesScreen = readFileSync(join(root, "src", "features", "ventas", "screens", "VentasScreen.tsx"), "utf8");
  assert.match(salesScreen, /subscribeAuthorizationScopeReset\(/);
  for (const reset of [
    "setBranchId(null)",
    'setSearch("")',
    'setDeferredSearch("")',
    "setCart([])",
    'setPayment("efectivo")',
    "setSummaryVisible(false)",
    "setCancelSaleTarget(null)",
    "setPendingProduct(null)",
    "setPendingBatch(null)",
    "setPendingStockSnapshot(null)",
    "setLineaBorrada(null)",
    "setRefreshError(null)",
  ]) {
    assert.ok(salesScreen.includes(reset), `expected mounted sales reset to include ${reset}`);
  }
});

test("failed-profile retry clears unknown authorization scope before fetching a replacement profile", () => {
  const authHook = readFileSync(join(root, "src", "features", "auth", "hooks", "useAuth.tsx"), "utf8");
  const syncStart = authHook.slice(authHook.indexOf("const previousProfile"), authHook.indexOf("try {", authHook.indexOf("const previousProfile")));

  assert.match(syncStart, /previousProfile === null/);
  assert.match(syncStart, /clearAuthorizationScopedState\(\)/);
  assert.ok(
    syncStart.indexOf("clearAuthorizationScopedState()") < syncStart.indexOf("const token"),
    "unknown prior scope must be cleared before the profile fetch starts",
  );
  assert.match(authHook, /if \(previousProfile && hasAuthorizationScopeChanged\(previousProfile, profile\)\)/);
});

test("same-user profile revalidation leaves the Expo protected route guard ready and covers navigation", () => {
  const layout = readFileSync(join(root, "src", "app", "_layout.tsx"), "utf8");
  const drawer = readFileSync(join(root, "src", "shared", "components", "AppDrawerProvider.tsx"), "utf8");
  const authHook = readFileSync(join(root, "src", "features", "auth", "hooks", "useAuth.tsx"), "utf8");
  const authBoundary = readFileSync(join(root, "src", "features", "auth", "lib", "authBoundary.ts"), "utf8");
  const login = readFileSync(join(root, "src", "features", "auth", "screens", "LoginScreen.tsx"), "utf8");

  assert.match(layout, /<Stack\.Protected guard=\{status === "ready"\}>/);
  assert.match(layout, /<Stack\.Protected guard=\{status !== "ready"\}>/);
  assert.match(drawer, /const \{ status, isRevalidating \} = useAuth\(\)/);
  assert.match(drawer, /<Modal[\s\S]*?visible=\{showRevalidationCover\}/);
  assert.match(drawer, /showRevalidationCover = status === "ready" && isRevalidating/);
  assert.match(drawer, /animationType="none"/);
  assert.match(drawer, /if \(status !== "ready"\)/);
  assert.match(authHook, /fetchProfile\(userId\)/);
  assert.match(authHook, /if \(previousProfile && hasAuthorizationScopeChanged\(previousProfile, profile\)\) \{\s*clearAuthorizationScopedState\(\)/);
  assert.match(authHook, /function blockedState[\s\S]*?profile: null[\s\S]*?isRevalidating: false/);
  assert.match(authHook, /syncAIKeysFromCloud\(\)/);
  assert.match(login, /status === "blocked" && session/);
  assert.match(login, /retryProfile\(\)/);
  assert.match(login, /signOut\(\)/);
  const scopeCleanup = authBoundary.match(/export function clearAuthorizationScopedState\(\): void \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(scopeCleanup, /queryClient\.clear\(\)/);
  assert.match(scopeCleanup, /clearAuthorizationScopedSalesState\(\)/);
  assert.doesNotMatch(scopeCleanup, /clearAllLocalAIKeys/);
  assert.match(authBoundary, /void clearAllLocalAIKeys\(\)/);
});

test("authorization-scope cleanup also resets the mounted sales screen before revealing refreshed content", () => {
  const salesScreen = readFileSync(join(root, "src", "features", "ventas", "screens", "VentasScreen.tsx"), "utf8");

  assert.match(salesScreen, /authorizationScopeEpochRef/);
  assert.match(salesScreen, /const scopeEpoch = authorizationScopeEpochRef\.current/);
  assert.match(salesScreen, /if \(scopeEpoch !== authorizationScopeEpochRef\.current\) return/);
});

test("late sale success from an old authorization scope cannot clear a new-scope cart", () => {
  const { runIfCurrentAuthorizationScope } = loadTsModule("src/features/auth/lib/authState.ts");
  let currentScopeEpoch = 4;
  const saleScopeEpoch = 3;
  const cart = [{ productId: "new-scope-product" }];
  let successNoticeShown = false;

  runIfCurrentAuthorizationScope(saleScopeEpoch, currentScopeEpoch, () => {
    cart.length = 0;
    successNoticeShown = true;
  });

  assert.deepEqual(cart, [{ productId: "new-scope-product" }]);
  assert.equal(successNoticeShown, false);

  const salesScreen = readFileSync(join(root, "src", "features", "ventas", "screens", "VentasScreen.tsx"), "utf8");
  const confirm = salesScreen.slice(salesScreen.indexOf("const confirm = () => {"), salesScreen.indexOf("const branchName"));

  assert.match(confirm, /const saleScopeEpoch = authorizationScopeEpochRef\.current/);
  assert.match(
    confirm,
    /onSuccess: \(\) => \{\s*runIfCurrentAuthorizationScope\(saleScopeEpoch, authorizationScopeEpochRef\.current, \(\) => \{[\s\S]*?setSummaryVisible\(false\);[\s\S]*?setCart\(\[\]\);[\s\S]*?Alert\.alert\([\s\S]*?\);\s*\}\);\s*\}/,
  );
});

test("late sale failure from an old authorization scope does not show a stale alert", () => {
  const { runIfCurrentAuthorizationScope } = loadTsModule("src/features/auth/lib/authState.ts");
  const currentScopeEpoch = 8;
  const saleScopeEpoch = 7;
  const alerts = [];

  runIfCurrentAuthorizationScope(saleScopeEpoch, currentScopeEpoch, () => alerts.push("old-scope failure"));
  assert.deepEqual(alerts, []);

  runIfCurrentAuthorizationScope(currentScopeEpoch, currentScopeEpoch, () => alerts.push("current-scope failure"));
  assert.deepEqual(alerts, ["current-scope failure"]);

  const salesScreen = readFileSync(join(root, "src", "features", "ventas", "screens", "VentasScreen.tsx"), "utf8");
  const confirm = salesScreen.slice(salesScreen.indexOf("const confirm = () => {"), salesScreen.indexOf("const branchName"));

  assert.match(
    confirm,
    /onError: \(error\) => \{\s*runIfCurrentAuthorizationScope\(saleScopeEpoch, authorizationScopeEpochRef\.current, \(\) => \{[\s\S]*?Alert\.alert\([\s\S]*?extraerMensajeError\(error[\s\S]*?\);\s*\}\);\s*\}/,
  );
});

test("sale mutation errors render only in the authorization scope that produced them", () => {
  const { getCurrentAuthorizationScopeValue } = loadTsModule("src/features/auth/lib/authState.ts");
  const oldScopeError = new Error("Old-scope failure");

  assert.equal(getCurrentAuthorizationScopeValue(6, 7, oldScopeError), null);
  assert.equal(getCurrentAuthorizationScopeValue(7, 7, oldScopeError), oldScopeError);
  assert.equal(getCurrentAuthorizationScopeValue(null, 7, oldScopeError), null);

  const salesScreen = readFileSync(join(root, "src", "features", "ventas", "screens", "VentasScreen.tsx"), "utf8");
  const confirm = salesScreen.slice(salesScreen.indexOf("const confirm = () => {"), salesScreen.indexOf("const branchName"));
  const mutationError = salesScreen.slice(
    salesScreen.indexOf("const currentMutationError ="),
    salesScreen.indexOf("const handleConfirmAnulacion"),
  );

  assert.match(salesScreen, /const \[mutationErrorScopeEpoch, setMutationErrorScopeEpoch\] = useState<number \| null>\(null\)/);
  assert.match(salesScreen, /setMutationErrorScopeEpoch\(null\)/);
  assert.match(confirm, /setMutationErrorScopeEpoch\(saleScopeEpoch\)/);
  assert.match(
    mutationError,
    /getCurrentAuthorizationScopeValue\(\s*mutationErrorScopeEpoch,\s*authorizationScopeEpochRef\.current,\s*mutation\.error,?\s*\)/,
  );
});

test("restricted access navigation backs in-stack and replaces direct links with authenticated home", () => {
  const { getPermissionDeniedNavigation } = loadTsModule(
    "src/features/auth/lib/restrictedAccessNavigation.ts",
  );

  assert.deepEqual(getPermissionDeniedNavigation(true), { type: "back" });
  assert.deepEqual(getPermissionDeniedNavigation(false), {
    type: "replace",
    href: "/",
  });
});

test("dev login shortcuts cover all seven roles", () => {
  const source = readFileSync(join(root, "src", "features", "auth", "screens", "LoginScreen.tsx"), "utf8");
  const emails = [
    "admin.lidemoda@gmail.com",
    "encargada.comercio@gmail.com",
    "cajera.montenegro@gmail.com",
    "vendedora.ceja@gmail.com",
    "almacen.central@gmail.com",
    "marketing.lidemoda@gmail.com",
    "reponedora.lidemoda@gmail.com",
  ];
  for (const email of emails) {
    assert.match(source, new RegExp(email.replaceAll(".", "\\.")));
  }
  assert.match(source, /label: "Marketing"/);
  assert.match(source, /label: "Reponedora"/);
});

test("the auth rollout is fail-closed and contains no credential provisioning", () => {
  const sql = readFileSync(join(root, "scripts", "auth-v1-rollout.sql"), "utf8");
  assert.match(sql, /AUTH_V1_PREFLIGHT_ABORT/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.registrar_venta/);
  assert.match(sql, /private\.require_actor/);
  assert.match(sql, /CREATE POLICY perfiles_select_self_or_admin/);
  assert.doesNotMatch(sql, /password\s*[:=]\s*['"][^'"]+['"]/i);
});
