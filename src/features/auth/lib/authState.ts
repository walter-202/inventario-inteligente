import type { Session } from "@supabase/supabase-js";
import type { AuthState, UserProfile } from "./authTypes";

export interface SessionSyncToken {
  epoch: number;
  userId: string | null;
}

/**
 * Keep an authenticated navigator mounted only while the same user's current
 * profile is being rechecked. Initial resolution and identity changes remain
 * fail-closed behind the loading route.
 */
export function prepareProfileSyncState(
  previousState: AuthState,
  session: Session,
  isSameActiveUser: boolean,
): AuthState {
  const userId = session.user.id;
  const profile =
    isSameActiveUser && previousState.status === "ready" && previousState.profile?.id === userId
      ? previousState.profile
      : null;
  const isRevalidating = profile !== null;

  return {
    status: isRevalidating ? "ready" : "loading",
    session,
    profile,
    error: null,
    blockedReason: null,
    isRevalidating,
  };
}

export function hasAuthorizationScopeChanged(
  previousProfile: Pick<UserProfile, "id" | "rol" | "sucursal_id"> | null,
  nextProfile: Pick<UserProfile, "id" | "rol" | "sucursal_id">,
): boolean {
  return previousProfile === null || (
    previousProfile.id !== nextProfile.id ||
    previousProfile.rol !== nextProfile.rol ||
    previousProfile.sucursal_id !== nextProfile.sucursal_id
  );
}

export function runIfCurrentAuthorizationScope(
  capturedScopeEpoch: number,
  currentScopeEpoch: number,
  effect: () => void,
): void {
  if (capturedScopeEpoch !== currentScopeEpoch) return;
  effect();
}

export function getCurrentAuthorizationScopeValue<T>(
  capturedScopeEpoch: number | null,
  currentScopeEpoch: number,
  value: T | null | undefined,
): T | null {
  return capturedScopeEpoch === currentScopeEpoch ? value ?? null : null;
}

/**
 * Keeps an async profile lookup from installing data after a newer auth event.
 * Auth events can arrive in quick succession during refresh, sign-out, or user
 * switching, so the provider must check the token immediately before commit.
 */
export function createSessionSyncController() {
  let epoch = 0;
  let currentUserId: string | null = null;

  return {
    begin(userId: string | null): SessionSyncToken {
      epoch += 1;
      currentUserId = userId;
      return { epoch, userId };
    },
    isCurrent(token: SessionSyncToken): boolean {
      return token.epoch === epoch && token.userId === currentUserId;
    },
    reset(): SessionSyncToken {
      return this.begin(null);
    },
  };
}
