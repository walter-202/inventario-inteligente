import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assistantAgentPath = resolve(root, "src/features/asistente-ia/api/assistantAgent.ts");

function loadAssistantAgent({ streamText, generateText, models }) {
  const calls = [];
  const stepLimits = [];
  const ai = {
    streamText(options) {
      calls.push({ method: "streamText", options });
      return streamText(options);
    },
    async generateText(options) {
      calls.push({ method: "generateText", options });
      return generateText(options);
    },
    isStepCount(limit) {
      stepLimits.push(limit);
      return () => true;
    },
    tool: (definition) => definition,
  };

  const module = new Module(assistantAgentPath);
  module.filename = assistantAgentPath;
  module.paths = Module._nodeModulePaths(dirname(assistantAgentPath));
  module.require = (request) => {
    if (request === "ai") return ai;
    if (request === "../lib/aiSdkProviders") {
      return {
        ASSISTANT_CONFIG_MESSAGE: "configure provider",
        ASSISTANT_PROVIDER_ERROR_MESSAGE: "provider error",
        ASSISTANT_TIMEOUT_MESSAGE: "provider timeout",
        listAssistantModels: async () => models,
      };
    }
    if (request === "../lib/assistantTools") {
      return {
        createAssistantToolExecutors: () => ({}),
        mapToolOutputsToResult: (outputs, text, thoughts) => ({
          tipo: "asistente",
          mensaje: text,
          resultados: outputs,
          pasosPensamiento: thoughts,
        }),
      };
    }
    if (request === "../../../shared/lib/utils") {
      return { normalizarMonedaAsistente: (text) => text };
    }
    throw new Error(`Unexpected assistantAgent dependency: ${request}`);
  };

  const source = readFileSync(assistantAgentPath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: assistantAgentPath,
  });
  module._compile(outputText, assistantAgentPath);
  return { assistantAgent: module.exports, calls, stepLimits };
}

function streamResult({ chunks = [], error, text = chunks.join("") } = {}) {
  return {
    textStream: (async function* () {
      for (const chunk of chunks) yield chunk;
      if (error) throw error;
    })(),
    text: Promise.resolve(text),
    toolResults: Promise.resolve([]),
    steps: Promise.resolve([]),
    finishReason: Promise.resolve("stop"),
  };
}

const scope = { activeBranchName: "Centro", allowedBranchNames: ["Centro"] };
const userTurn = { text: "Hola", history: [], scope };
const ollama = { providerId: "ollama", modelId: "local-model", model: {} };

test("a failed stream does not silently replay the full turn with generateText", async () => {
  const { assistantAgent, calls } = loadAssistantAgent({
    models: [ollama],
    streamText: () => streamResult({ error: new Error("ambiguous stream timeout") }),
    generateText: async () => ({ text: "replayed response", toolResults: [], steps: [] }),
  });

  const result = await assistantAgent.runAssistantTurn(userTurn);

  assert.deepEqual(calls.map((call) => call.method), ["streamText"]);
  assert.equal(result.mensaje, "provider error");
});

test("the retained stream path disables SDK retries and caps tool cycles at four", async () => {
  const { assistantAgent, calls, stepLimits } = loadAssistantAgent({
    models: [ollama],
    streamText: () => streamResult({ chunks: ["respuesta"] }),
    generateText: async () => ({ text: "unexpected generation", toolResults: [], steps: [] }),
  });

  await assistantAgent.runAssistantTurn(userTurn);

  assert.deepEqual(calls.map((call) => call.method), ["streamText"]);
  assert.equal(calls[0].options.maxRetries, 0);
  assert.deepEqual(stepLimits, [4]);
});

test("Auto mode may fail over once per configured provider without replaying one provider", async () => {
  const first = { providerId: "groq", modelId: "first", model: { id: "first" } };
  const second = { providerId: "ollama", modelId: "second", model: { id: "second" } };
  const { assistantAgent, calls } = loadAssistantAgent({
    models: [first, second],
    streamText: ({ model }) =>
      model.id === "first"
        ? streamResult({ error: new Error("ambiguous stream failure") })
        : streamResult({ chunks: ["recovered"] }),
    generateText: async () => ({ text: "unexpected generation", toolResults: [], steps: [] }),
  });

  const result = await assistantAgent.runAssistantTurn(userTurn);

  assert.deepEqual(calls.map((call) => [call.method, call.options.model.id]), [
    ["streamText", "first"],
    ["streamText", "second"],
  ]);
  assert.equal(result.mensaje, "recovered");
});
