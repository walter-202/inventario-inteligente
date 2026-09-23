export type AssistantChatRequest = Readonly<{
  sessionId: string;
  signal: AbortSignal;
}>;

export type AssistantFailedDraft = Readonly<{
  sessionId: string;
  text: string;
  history: Array<{ role: "usuario" | "asistente"; texto: string }>;
}>;

type ActiveAssistantChatRequest = {
  request: AssistantChatRequest;
  controller: AbortController;
};

/** A synchronous single-flight guard shared by button and keyboard submits. */
export class AssistantChatRequestLifecycle {
  private active: ActiveAssistantChatRequest | null = null;

  begin(sessionId: string | (() => string)): AssistantChatRequest | null {
    if (this.active) return null;

    const controller = new AbortController();
    const request: AssistantChatRequest = {
      sessionId: typeof sessionId === "function" ? sessionId() : sessionId,
      signal: controller.signal,
    };
    this.active = { request, controller };
    return request;
  }

  isCurrent(request: AssistantChatRequest): boolean {
    return this.active?.request === request && !request.signal.aborted;
  }

  finish(request: AssistantChatRequest): boolean {
    if (this.active?.request !== request) return false;
    this.active = null;
    return true;
  }

  cancel(sessionId?: string): boolean {
    const active = this.active;
    if (!active || (sessionId !== undefined && active.request.sessionId !== sessionId)) return false;

    this.active = null;
    active.controller.abort();
    return true;
  }
}

export function isAssistantFailedDraftRetry(
  failedDraft: Pick<AssistantFailedDraft, "sessionId" | "text"> | null | undefined,
  sessionId: string,
  text: string,
): boolean {
  return failedDraft?.sessionId === sessionId && failedDraft.text === text;
}
