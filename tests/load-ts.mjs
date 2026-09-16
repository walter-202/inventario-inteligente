import { readFileSync, existsSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { Module } from "node:module";
import * as ts from "typescript";

const cache = new Map();
const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(\w):/, "$1:"));

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "react-native") {
    return {
      Platform: { OS: "web" },
      AppState: { addEventListener: () => ({ remove: () => {} }) },
    };
  }
  if (request === "@react-native-async-storage/async-storage") {
    return {
      getItem: async () => null,
      setItem: async () => {},
      removeItem: async () => {},
    };
  }
  if (request.startsWith("react-native-url-polyfill")) {
    return {};
  }
  return originalLoad.apply(this, arguments);
};

function resolveTypeScriptPath(parentFile, request) {
  const candidate = resolve(dirname(parentFile), request);
  for (const path of [candidate, `${candidate}.ts`, `${candidate}.tsx`, `${candidate}.js`]) {
    if (existsSync(path)) return path;
  }
  return null;
}

export function loadTsModule(relativePath) {
  const filename = resolve(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = new Module(filename, null);
  module.filename = filename;
  module.paths = Module._nodeModulePaths(dirname(filename));
  cache.set(filename, module);
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  }).outputText;
  const originalRequire = module.require.bind(module);
  module.require = (request) => {
    if (request === "react-native") {
      return {
        Platform: { OS: "web" },
        AppState: { addEventListener: () => ({ remove: () => {} }) },
      };
    }
    if (request === "@react-native-async-storage/async-storage") {
      return {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {},
      };
    }
    if (request.startsWith(".")) {
      const resolved = resolveTypeScriptPath(filename, request);
      if (resolved && extname(resolved) === ".ts") return loadTsModule(relative(root, resolved).replaceAll("\\", "/"));
    }
    return originalRequire(request);
  };
  module._compile(output, filename);
  return module.exports;
}
