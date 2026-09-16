import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { supabase } from "../../../shared/lib/supabase";
import { AuthProfileError, fetchProfile, getAuthErrorMessage, signInWithPassword, signOut as signOutApi } from "../api/authApi";
import { clearAuthScopedState } from "../lib/authBoundary";
import { createSessionSyncController } from "../lib/authState";
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
  };
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    session: null,
    profile: null,
    error: null,
    blockedReason: null,
  });
  const stateRef = useRef(state);
  const syncControllerRef = useRef(createSessionSyncController());
  const activeUserRef = useRef<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const synchronizeSession = useCallback(async (session: Session | null) => {
    if (!session) {
      syncControllerRef.current.reset();
      activeUserRef.current = null;
      clearAuthScopedState();
      setState({ status: "signed-out", session: null, profile: null, error: null, blockedReason: null });
      return;
    }

    const userId = session.user.id;
    const userChanged = activeUserRef.current !== null && activeUserRef.current !== userId;
    if (userChanged) clearAuthScopedState();
    activeUserRef.current = userId;
    const token = syncControllerRef.current.begin(userId);
    setState((previous) => ({
      status: "loading",
      session,
      profile: previous.profile?.id === userId ? previous.profile : null,
      error: null,
      blockedReason: null,
    }));

    try {
      const profile = await fetchProfile(userId);
      if (!syncControllerRef.current.isCurrent(token)) return;
      setState({ status: "ready", session, profile, error: null, blockedReason: null });
    } catch (error) {
      if (!syncControllerRef.current.isCurrent(token)) return;
      setState(blockedState(session, error));
    }
  }, []);

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
      if (session) setState((previous) => ({ ...previous, session }));
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        setState({ status: "signed-out", session: null, profile: null, error: getAuthErrorMessage(error), blockedReason: null });
        return;
      }
      scheduleSynchronization(data.session);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [synchronizeSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    setState((previous) => ({ ...previous, status: "loading", error: null, blockedReason: null }));
    try {
      const { session } = await signInWithPassword({ email, password });
      await synchronizeSession(session);
    } catch (error) {
      clearAuthScopedState();
      setState({ status: "signed-out", session: null, profile: null, error: getAuthErrorMessage(error), blockedReason: null });
      throw error;
    }
  }, [synchronizeSession]);

  const signOut = useCallback(async () => {
    syncControllerRef.current.reset();
    activeUserRef.current = null;
    clearAuthScopedState();
    setState({ status: "signed-out", session: null, profile: null, error: null, blockedReason: null });
    try {
      await signOutApi();
    } catch (error) {
      // Keep the UI fail-closed even if the network cannot revoke the remote
      // session. Supabase's local persisted session is removed on success.
      setState((previous) => ({ ...previous, error: getAuthErrorMessage(error) }));
      throw error;
    }
  }, []);

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
