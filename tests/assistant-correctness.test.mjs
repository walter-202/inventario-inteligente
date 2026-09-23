import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadTsModule } from "./load-ts.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const ALL_ABILITIES = [
  "dashboard.read",
  "inventory.read",
  "inventory.write",
  "products.read",
  "products.write",
  "sales.read",
  "sales.write",
  "movements.write",
  "ai.read",
  "users.manage",
];

const branches = [{ id: 1, nombre: "Central" }];
const profileFor = (rol) => ({
  id: `user-${rol}`,
  email: `${rol}@example.com`,
  nombre: rol,
  rol,
  sucursal_id: 1,
  created_at: "",
  updated_at: "",
});

test("assistant authorization context exposes every granted Ability to the model", () => {
  const { buildAssistantScopeContext } = loadTsModule("src/features/asistente-ia/lib/assistantAuthorization.ts");
  const roles = ["admin", "encargada", "cajera", "vendedora", "almacen", "reponedora", "marketing"];
  const exposed = new Set(
    roles.flatMap((rol) => buildAssistantScopeContext(profileFor(rol), branches, 1).abilities),
  );

  assert.deepEqual([...exposed].sort(), [...ALL_ABILITIES].sort());
});

test("switching assistant users never deletes the previous user's persisted chat", () => {
  const view = read("src/features/asistente-ia/screens/VoiceCommandView.tsx");

  assert.doesNotMatch(view, /\bclearAssistantChat\b/);
  assert.doesNotMatch(view, /\.removeItem\s*\(/);
});

test("assistant prompt advertises only the supported sales period", () => {
  const source = read("src/features/asistente-ia/api/assistantAgent.ts");

  assert.match(source, /solo del día de hoy/);
  assert.match(source, /no hay semana ni mes/);
  assert.match(source, /Código de barras escaneado/);
  assert.match(source, /boliviano \(Bs\.\)/);
  assert.match(source, /Nunca uses \$.*USD/);
});

test("assistant currency prose uses bolivianos, not dollar signs", () => {
  const { normalizarMonedaAsistente } = loadTsModule("src/shared/lib/utils.ts");

  assert.equal(
    normalizarMonedaAsistente("Sombras (SKU: BEL-024) - $35 y otra a $20"),
    "Sombras (SKU: BEL-024) - Bs. 35 y otra a Bs. 20",
  );
});
