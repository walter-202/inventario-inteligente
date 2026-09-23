import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { supabase } from "../../../shared/lib/supabase";
import { AuthProfileError, fetchProfile, getAuthErrorMessage, signInWithPassword, signOut as signOutApi } from "../api/authApi";
import { clearAuthScopedState, clearAuthorizationScopedState } from "../lib/authBoundary";
import { createSessionSyncController, hasAuthorizationScopeChanged, prepareProfileSyncState } from "../lib/authState";
import { syncAIKeysFromCloud } from "../../asistente-ia/lib/aiVaultSync";
import type { AuthState } from "../lib/authTypes";

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  retryProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function blockedState(session: Session, error: unknown): AuthState {
  const profileError = error instanceof AuthProfileError ? error : null;
  return {
    status: "blocked",
    session,
    profile: null,
    error: profileError?.message ?? "No se pudo cargar el perfil de acceso.",
    blockedReason: profileError?.reason ?? "profile-unavailable",
    isRevalidating: false,
  };
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    session: null,
    profile: null,
    error: null,
    blockedReason: null,
    isRevalidating: false,
  });
  const stateRef = useRef(state);
  const syncControllerRef = useRef(createSessionSyncController());
  const activeUserRef = useRef<string | null>(null);

  const commitState = useCallback((nextState: AuthState) => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const updateState = useCallback((update: (previous: AuthState) => AuthState) => {
    commitState(update(stateRef.current));
  }, [commitState]);

  const synchronizeSession = useCallback(async (session: Session | null) => {
    if (!session) {
      syncControllerRef.current.reset();
      activeUserRef.current = null;
      clearAuthScopedState();
      commitState({ status: "signed-out", session: null, profile: null, error: null, blockedReason: null, isRevalidating: false });
      return;
    }

    const userId = session.user.id;
    const isSameActiveUser = activeUserRef.current === userId;
    const previousState = stateRef.current;
    const previousProfile =
      isSameActiveUser && previousState.status === "ready" && previousState.profile?.id === userId
        ? previousState.profile
        : null;
    const userChanged = activeUserRef.current !== null && !isSameActiveUser;
    if (userChanged) clearAuthScopedState();
    else if (previousProfile === null) clearAuthorizationScopedState();
    activeUserRef.current = userId;
    const token = syncControllerRef.current.begin(userId);
    commitState(prepareProfileSyncState(previousState, session, isSameActiveUser));

    try {
      const profile = await fetchProfile(userId);
      if (!syncControllerRef.current.isCurrent(token)) return;
      if (previousProfile && hasAuthorizationScopeChanged(previousProfile, profile)) {
        clearAuthorizationScopedState();
      }
      commitState({ status: "ready", session, profile, error: null, blockedReason: null, isRevalidating: false });
      void syncAIKeysFromCloud();
    } catch (error) {
      if (!syncControllerRef.current.isCurrent(token)) return;
      commitState(blockedState(session, error));
    }
  }, [commitState]);

  useEffect(() => {
    let mounted = true;

    const scheduleSynchronization = (session: Session | null) => {
      // Supabase warns against awaiting additional auth work inside this
      // callback. Scheduling keeps profile I/O outside onAuthStateChange.
      void Promise.resolve().then(() => {
        if (mounted) return synchronizeSession(session);
        return undefined;
      });
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT") {
        scheduleSynchronization(null);
        return;
      }
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || activeUserRef.current !== session?.user.id) {
        scheduleSynchronization(session);
        return;
      }
      if (session) updateState((previous) => ({ ...previous, session }));
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        commitState({
          status: "signed-out",
          session: null,
          profile: null,
          error: getAuthErrorMessage(error),
          blockedReason: null,
          isRevalidating: false,
        });
        return;
      }
      scheduleSynchronization(data.session);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [commitState, synchronizeSession, updateState]);

  const signIn = useCallback(async (email: string, password: string) => {
    updateState((previous) => ({ ...previous, status: "loading", error: null, blockedReason: null, isRevalidating: false }));
    try {
      const { session } = await signInWithPassword({ email, password });
      await synchronizeSession(session);
    } catch (error) {
      clearAuthScopedState();
      activeUserRef.current = null;
      syncControllerRef.current.reset();
      commitState({
        status: "signed-out",
        session: null,
        profile: null,
        error: getAuthErrorMessage(error),
        blockedReason: null,
        isRevalidating: false,
      });
      throw error;
    }
  }, [commitState, synchronizeSession, updateState]);

  const signOut = useCallback(async () => {
    syncControllerRef.current.reset();
    activeUserRef.current = null;
    clearAuthScopedState();
    commitState({ status: "signed-out", session: null, profile: null, error: null, blockedReason: null, isRevalidating: false });
    try {
      await signOutApi();
    } catch (error) {
      // Keep the UI fail-closed even if the network cannot revoke the remote
      // session. Supabase's local persisted session is removed on success.
      updateState((previous) => ({ ...previous, error: getAuthErrorMessage(error) }));
      throw error;
    }
  }, [commitState, updateState]);

  const retryProfile = useCallback(async () => {
    const session = stateRef.current.session;
    if (session) await synchronizeSession(session);
  }, [synchronizeSession]);

  const value = useMemo<AuthContextValue>(() => ({ ...state, signIn, signOut, retryProfile }), [retryProfile, signIn, signOut, state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside SessionProvider");
  return value;
}
