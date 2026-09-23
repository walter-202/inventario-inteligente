import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadAssistantAgent({ streamText, models }) {
  const calls = [];
  const dependencies = {
    ai: {
      streamText(options) {
        calls.push({ model: options.model.id, abortSignal: options.abortSignal });
        return streamText(options);
      },
      isStepCount: () => () => true,
      tool: (definition) => definition,
    },
    "../lib/aiSdkProviders": {
      ASSISTANT_CONFIG_MESSAGE: "configure provider",
      ASSISTANT_PROVIDER_ERROR_MESSAGE: "provider error",
      ASSISTANT_TIMEOUT_MESSAGE: "provider timeout",
      listAssistantModels: async () => models,
    },
    "../lib/assistantTools": {
      createAssistantToolExecutors: () => ({}),
      mapToolOutputsToResult: (_outputs, text, thoughts) => ({
        tipo: "asistente",
        mensaje: text,
        pasosPensamiento: thoughts,
      }),
    },
    "../../../shared/lib/utils": { normalizarMonedaAsistente: (text) => text },
  };
  const filename = resolve(root, "src/features/asistente-ia/api/assistantAgent.ts");
  const module = new Module(filename);
  module.filename = filename;
  module.paths = Module._nodeModulePaths(dirname(filename));
  module.require = (request) => {
    if (Object.hasOwn(dependencies, request)) return dependencies[request];
    throw new Error(`Unexpected assistantAgent dependency: ${request}`);
  };
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(outputText, filename);
  return { assistantAgent: module.exports, calls };
}

function loadChatRequestLifecycle() {
  const filename = resolve(root, "src/features/asistente-ia/lib/assistantChatRequestLifecycle.ts");
  const module = new Module(filename);
  module.filename = filename;
  module.paths = Module._nodeModulePaths(dirname(filename));
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(outputText, filename);
  return module.exports;
}

function emptyStreamResult(text = "") {
  return {
    textStream: (async function* () {})(),
    text: Promise.resolve(text),
    toolResults: Promise.resolve([]),
    steps: Promise.resolve([]),
    finishReason: Promise.resolve("stop"),
  };
}

test("cancelling an active chat turn does not fail over to another provider", async () => {
  let streamStartedResolve;
  let releaseFirstStream;
  const streamStarted = new Promise((resolveStarted) => { streamStartedResolve = resolveStarted; });
  const firstStreamRelease = new Promise((resolveRelease) => { releaseFirstStream = resolveRelease; });
  const models = [
    { providerId: "groq", modelId: "primary", model: { id: "primary" } },
    { providerId: "ollama", modelId: "fallback", model: { id: "fallback" } },
  ];
  const { assistantAgent, calls } = loadAssistantAgent({
    models,
    streamText: ({ model }) => {
      if (model.id !== "primary") return emptyStreamResult("fallback response");
      return {
        ...emptyStreamResult(),
        textStream: (async function* () {
          streamStartedResolve();
          await firstStreamRelease;
          throw new Error("request cancelled");
        })(),
      };
    },
  });
  const request = new AbortController();
  const turn = assistantAgent.runAssistantTurn({
    text: "Consultar inventario",
    history: [],
    scope: { activeBranchName: "Centro", allowedBranchNames: ["Centro"] },
    abortSignal: request.signal,
  });

  await streamStarted;
  request.abort();
  releaseFirstStream();
  const result = await turn;

  assert.deepEqual(calls.map((call) => call.model), ["primary"]);
  assert.equal(calls[0]?.abortSignal.aborted, true);
  assert.equal(assistantAgent.isRetryableAssistantResult(result), true);
  assert.equal(result.retryable, true);
});

test("chat request lifecycle rejects duplicate submits and cancels only its active session", () => {
  const { AssistantChatRequestLifecycle } = loadChatRequestLifecycle();
  const lifecycle = new AssistantChatRequestLifecycle();
  let resolvedSessions = 0;
  const resolveSession = () => `session-${++resolvedSessions}`;
  const active = lifecycle.begin(resolveSession);

  assert.ok(active);
  assert.equal(lifecycle.begin(resolveSession), null);
  assert.equal(resolvedSessions, 1);
  assert.equal(lifecycle.cancel("session-2"), false);
  assert.equal(active.signal.aborted, false);
  assert.equal(lifecycle.cancel("session-1"), true);
  assert.equal(active.signal.aborted, true);

  const next = lifecycle.begin("session-2");
  assert.ok(next);
  assert.equal(lifecycle.finish(active), false);
  assert.equal(lifecycle.isCurrent(next), true);
  assert.equal(lifecycle.finish(next), true);
  assert.equal(lifecycle.begin("session-2")?.signal.aborted, false);
});

test("failed draft retry is limited to the same session and submitted text", () => {
  const { isAssistantFailedDraftRetry } = loadChatRequestLifecycle();
  const failedDraft = { sessionId: "session-1", text: "Consultar inventario" };

  assert.equal(isAssistantFailedDraftRetry(failedDraft, "session-1", "Consultar inventario"), true);
  assert.equal(isAssistantFailedDraftRetry(failedDraft, "session-2", "Consultar inventario"), false);
  assert.equal(isAssistantFailedDraftRetry(failedDraft, "session-1", "Consultar stock"), false);
});

test("provider and configuration clarifications are marked retryable, ordinary clarifications are not", async () => {
  const { assistantAgent } = loadAssistantAgent({ models: [], streamText: emptyStreamResult });

  const noProvider = await assistantAgent.runAssistantTurn({
    text: "Consultar inventario",
    history: [],
    scope: { activeBranchName: "Centro", allowedBranchNames: ["Centro"] },
  });
  assert.equal(noProvider.tipo, "aclaracion");
  assert.equal(noProvider.retryable, true);
  assert.equal(assistantAgent.isRetryableAssistantResult({
    tipo: "aclaracion",
    mensaje: "Provider failure",
    retryable: true,
  }), true);
  assert.equal(assistantAgent.isRetryableAssistantResult({
    tipo: "aclaracion",
    mensaje: "Configure provider",
    retryable: true,
  }), true);
  assert.equal(assistantAgent.isRetryableAssistantResult({
    tipo: "aclaracion",
    mensaje: "What size do you need?",
  }), false);
});

test("chat composer routes keyboard and button sends through the guarded callback and exposes retry", () => {
  const composer = readFileSync(resolve(root, "src/features/asistente-ia/components/ChatComposer.tsx"), "utf8");
  const screen = readFileSync(resolve(root, "src/features/asistente-ia/screens/VoiceCommandView.tsx"), "utf8");

  assert.match(composer, /onSubmitEditing=\{onSend\}/);
  assert.match(composer, /onPress=\{onSend\}/);
  assert.match(composer, /retryAvailable && onRetry/);
  assert.match(composer, /onPress=\{onRetry\}/);
  assert.match(screen, /requestLifecycleRef\.current\.begin\(asegurarSesion\)/);
  assert.match(screen, /abortSignal: request\.signal/);
  assert.match(screen, /retryAvailable=\{failedDraft\?\.sessionId === chat\.activeSessionId\}/);
  assert.match(screen, /requestLifecycleRef\.current\.cancel\(\)/);
});
