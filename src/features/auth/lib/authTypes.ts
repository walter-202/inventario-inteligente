import type { Session } from "@supabase/supabase-js";

export const ROLE_VALUES = [
  "admin",
  "encargada",
  "cajera",
  "vendedora",
  "almacen",
  "reponedora",
  "marketing",
] as const;

export type Role = (typeof ROLE_VALUES)[number];

export interface UserProfile {
  id: string;
  email: string | null;
  nombre: string | null;
  rol: Role;
  sucursal_id: number | null;
  created_at: string;
  updated_at: string;
}

export type AuthStatus = "loading" | "signed-out" | "ready" | "blocked";

export type AuthBlockedReason =
  | "missing-profile"
  | "unassigned-profile"
  | "invalid-profile"
  | "profile-unavailable";

export interface AuthState {
  status: AuthStatus;
  session: Session | null;
  profile: UserProfile | null;
  error: string | null;
  blockedReason: AuthBlockedReason | null;
  isRevalidating: boolean;
}
