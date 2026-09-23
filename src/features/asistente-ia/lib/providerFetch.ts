/**
 * OpenRouter / openai-compatible sometimes return tool `arguments` as an object.
 * The chat schema requires a string; AI SDK parseToolCall then calls `.trim()`
 * and Hermes throws, or stream chunks fail Zod and yield AI_NoOutputGeneratedError.
 */
export function stringifyToolCallArguments(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const root = payload as Record<string, unknown>;
  const choices = root.choices;
  if (!Array.isArray(choices)) return payload;

  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const record = choice as Record<string, unknown>;
    stringifyToolCallsOnMessage(record.message);
    stringifyToolCallsOnMessage(record.delta);
  }
  return payload;
}

function stringifyToolCallsOnMessage(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const toolCalls = (message as Record<string, unknown>).tool_calls;
  if (!Array.isArray(toolCalls)) return false;
  let changed = false;
  for (const call of toolCalls) {
    if (!call || typeof call !== "object") continue;
    const fn = (call as Record<string, unknown>).function;
    if (!fn || typeof fn !== "object") continue;
    const args = (fn as Record<string, unknown>).arguments;
    if (args != null && typeof args !== "string") {
      (fn as Record<string, unknown>).arguments = JSON.stringify(args);
      changed = true;
    }
  }
  return changed;
}

function sseLineHasObjectToolArguments(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const root = payload as Record<string, unknown>;
  if (!Array.isArray(root.choices)) return false;
  for (const choice of root.choices) {
    if (!choice || typeof choice !== "object") continue;
    const record = choice as Record<string, unknown>;
    if (messageHasObjectToolArguments(record.message) || messageHasObjectToolArguments(record.delta)) {
      return true;
    }
  }
  return false;
}

function messageHasObjectToolArguments(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const toolCalls = (message as Record<string, unknown>).tool_calls;
  if (!Array.isArray(toolCalls)) return false;
  return toolCalls.some((call) => {
    if (!call || typeof call !== "object") return false;
    const fn = (call as Record<string, unknown>).function;
    if (!fn || typeof fn !== "object") return false;
    const args = (fn as Record<string, unknown>).arguments;
    return args != null && typeof args !== "string";
  });
}

export function stringifySseToolCallArguments(chunk: string): string {
  return chunk
    .split(/\r?\n/)
    .map((line) => {
      if (!line.startsWith("data:")) return line;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") return line;
      try {
        const parsed = JSON.parse(data) as unknown;
        if (!sseLineHasObjectToolArguments(parsed)) return line;
        stringifyToolCallArguments(parsed);
        return `data: ${JSON.stringify(parsed)}`;
      } catch {
        return line;
      }
    })
    .join("\n");
}

function cloneHeaders(headers: Headers): Headers {
  const next = new Headers();
  headers.forEach((value, key) => {
    next.append(key, value);
  });
  return next;
}

/**
 * Buffer the HTTP body and coerce tool arguments to strings.
 * Avoid TransformStream / custom ReadableStream: Expo's polyfill of those
 * produced empty AI SDK steps. A complete `Response(text)` is parsed fine.
 */
export function wrapFetchForToolCalls(fetchImpl: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    const response = await fetchImpl(input, init);
    const contentType = response.headers.get("content-type") ?? "";
    const headers = cloneHeaders(response.headers);
    let raw = "";
    try {
      raw = await response.text();
    } catch {
      return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    const looksLikeSse = contentType.includes("event-stream") || /^\s*data:/m.test(raw);
    if (looksLikeSse) {
      return new Response(stringifySseToolCallArguments(raw), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    if (contentType.includes("json") || raw.trim().startsWith("{") || raw.trim().startsWith("[")) {
      try {
        const payload = stringifyToolCallArguments(JSON.parse(raw));
        headers.set("Content-Type", "application/json");
        return new Response(JSON.stringify(payload), {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch {
        return new Response(raw, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
    }

    return new Response(raw, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

export function coerceToolCallInput(input: unknown): string {
  if (typeof input === "string") return input;
  if (input == null) return "";
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

export function coerceGenerateToolCallInputs<T extends { content?: Array<{ type?: string; input?: unknown }> }>(
  result: T,
): T {
  if (!result?.content || !Array.isArray(result.content)) return result;
  for (const part of result.content) {
    if (part?.type === "tool-call" && part.input != null && typeof part.input !== "string") {
      part.input = coerceToolCallInput(part.input);
    }
  }
  return result;
}

export function polyfillAbortSignalThrowIfAborted(): void {
  const proto = AbortSignal.prototype as AbortSignal & { throwIfAborted?: () => void };
  if (typeof proto.throwIfAborted === "function") return;
  proto.throwIfAborted = function throwIfAborted() {
    if (this.aborted) {
      throw this.reason ?? new Error("Aborted");
    }
  };
}
