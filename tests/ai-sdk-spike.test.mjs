import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname.replace(/^\/(\w):/, "$1:");

loadOptionalAiKeys();

const groqKey = process.env.GROQ_API_KEY?.trim() || "";
const openRouterKey = process.env.OPENROUTER_API_KEY?.trim() || "";
const hasLiveKey = Boolean(groqKey || openRouterKey);
const skipLive = hasLiveKey ? false : "Falta GROQ_API_KEY u OPENROUTER_API_KEY en el entorno";

test("ai@7 exports generateText, streamText, isStepCount, Output.object and tool", async () => {
  const ai = await import("ai");
  assert.equal(typeof ai.generateText, "function");
  assert.equal(typeof ai.streamText, "function");
  assert.equal(typeof ai.isStepCount, "function");
  assert.equal(typeof ai.tool, "function");
  assert.equal(typeof ai.Output.object, "function");
});

test("openai-compatible, google and openrouter providers are importable", async () => {
  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
  const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
  assert.equal(typeof createOpenAICompatible, "function");
  assert.equal(typeof createGoogleGenerativeAI, "function");
  assert.equal(typeof createOpenRouter, "function");
});

test("A. tool loop without allowlist on failed demo prompt", { skip: skipLive, timeout: 45_000 }, async () => {
  const { generateText, tool, isStepCount } = await import("ai");
  const { z } = await import("zod");
  const model = await createLiveModel();
  const called = [];

  const result = await generateText({
    model,
    instructions:
      "Sos un asistente de inventario. Si el usuario quiere vender o consultar un producto, usá search_products con un query corto (nombre o categoría), no la frase completa.",
    prompt: "Quiero vender dos sombras para cejas",
    tools: {
      search_products: tool({
        description: "Busca productos por nombre o categoría. No uses la frase completa del usuario.",
        inputSchema: z.object({
          query: z.string().describe("Nombre o categoría a buscar"),
        }),
        execute: async ({ query }) => {
          called.push(query);
          return {
            products: [{ id: "mock-1", nombre: "Sombra para cejas", stock: 12 }],
            query,
          };
        },
      }),
    },
    stopWhen: isStepCount(3),
  });

  const hasToolCall = result.toolCalls.length > 0 || called.length > 0;
  const hasText = typeof result.text === "string" && result.text.trim().length > 0;
  assert.ok(hasToolCall || hasText, "expected a tool call or non-empty text without crashing");
});

test("B. custom OpenRouter provider via createOpenAICompatible", { skip: openRouterKey ? false : "Falta OPENROUTER_API_KEY", timeout: 45_000 }, async () => {
  const { generateText } = await import("ai");
  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  const openrouter = createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: openRouterKey,
    headers: {
      "HTTP-Referer": "https://lidemoda.app",
      "X-Title": "Lidemoda Mobile POS",
    },
  });

  const result = await generateText({
    model: openrouter("openrouter/free"),
    prompt: "Respondé con la palabra ok y nada más.",
  });

  assert.ok(typeof result.text === "string" && result.text.trim().length > 0);
});

test("C. Output.object form schema for product fields", { skip: skipLive, timeout: 45_000 }, async () => {
  const { generateText, Output } = await import("ai");
  const { z } = await import("zod");
  const camposProducto = z.object({
    nombre: z.string(),
    precio: z.number().nullable(),
    cantidad: z.number().int().nullable(),
    categoria: z.string().nullable(),
  });

  const result = await generateText({
    model: await createLiveModel(),
    output: Output.object({ schema: camposProducto }),
    prompt:
      'Extraé los campos del dictado: "labial mate rojo, categoría belleza, precio 45, 10 unidades". Si un campo no aparece, usá null.',
  });

  const parsed = camposProducto.safeParse(result.output);
  assert.equal(parsed.success, true, parsed.success ? "" : parsed.error.message);
  assert.equal(typeof parsed.data.nombre, "string");
  assert.ok(parsed.data.nombre.length > 0);
});

test("D. Node streamText accumulates at least one chunk", { skip: skipLive, timeout: 45_000 }, async () => {
  const { streamText } = await import("ai");
  const result = streamText({
    model: await createLiveModel(),
    prompt: "Decí hola en una sola palabra.",
  });

  let accumulated = "";
  let chunks = 0;
  for await (const chunk of result.textStream) {
    accumulated += chunk;
    chunks += 1;
  }

  assert.ok(chunks >= 1, "expected at least one stream chunk");
  assert.ok(accumulated.trim().length > 0, "expected accumulated text");
});

function loadOptionalAiKeys() {
  const envPath = join(root.replaceAll("/", "\\"), ".env");
  if (!existsSync(envPath)) return;
  const allowed = new Set(["GROQ_API_KEY", "OPENROUTER_API_KEY"]);
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!allowed.has(key) || process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function createLiveModel() {
  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  if (groqKey) {
    return createOpenAICompatible({
      name: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: groqKey,
    })("openai/gpt-oss-120b");
  }
  if (openRouterKey) {
    return createOpenAICompatible({
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: openRouterKey,
      headers: {
        "HTTP-Referer": "https://lidemoda.app",
        "X-Title": "Lidemoda Mobile POS",
      },
    })("openrouter/free");
  }
  throw new Error("No live AI key available");
}
