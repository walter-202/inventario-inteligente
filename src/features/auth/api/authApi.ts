import type { Session, User } from "@supabase/supabase-js";
import { z } from "zod";

import { supabase } from "../../../shared/lib/supabase";
import { ROLE_VALUES, type AuthBlockedReason, type Role, type UserProfile } from "../lib/authTypes";
import { isGlobalRole } from "../lib/permissions";

export const SignInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Ingresa un correo válido."),
  password: z.string().min(1, "Ingresa tu contraseña."),
});

const profileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().nullable(),
  nombre: z.string().nullable(),
  rol: z.enum(ROLE_VALUES),
  sucursal_id: z.number().int().positive().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export class AuthProfileError extends Error {
  readonly reason: AuthBlockedReason;

  constructor(reason: AuthBlockedReason, message: string) {
    super(message);
    this.name = "AuthProfileError";
    this.reason = reason;
  }
}

export function getAuthErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "No se pudo iniciar sesión. Intentá nuevamente.";
  const message = error.message.toLowerCase();
  if (message.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (message.includes("email not confirmed")) return "Confirmá tu correo antes de ingresar.";
  if (message.includes("rate limit")) return "Demasiados intentos. Esperá unos minutos y probá nuevamente.";
  return error.message || "No se pudo iniciar sesión. Intentá nuevamente.";
}

export async function signInWithPassword(input: unknown): Promise<{ session: Session; user: User }> {
  const credentials = SignInSchema.parse(input);
  const { data, error } = await supabase.auth.signInWithPassword(credentials);
  if (error) throw error;
  if (!data.session || !data.user) throw new Error("La sesión no pudo ser creada.");
  return { session: data.session, user: data.user };
}

export async function fetchProfile(userId: string): Promise<UserProfile> {
  const parsedUserId = z.string().uuid().parse(userId);
  const { data, error } = await supabase
    .from("perfiles")
    .select("id, email, nombre, rol, sucursal_id, created_at, updated_at")
    .eq("id", parsedUserId)
    .maybeSingle();

  if (error) throw new AuthProfileError("profile-unavailable", "No se pudo cargar tu perfil.");
  if (!data) throw new AuthProfileError("missing-profile", "Tu cuenta todavía no tiene un perfil habilitado.");

  const result = profileSchema.safeParse(data);
  if (!result.success) throw new AuthProfileError("invalid-profile", "El perfil recibido no es válido.");

  const profile = result.data as UserProfile;
  // Only an administrator may be global. Every operational account needs a
  // server-assigned branch; the app never infers one from client state.
  if (!isGlobalRole(profile.rol) && profile.sucursal_id === null) {
    throw new AuthProfileError("unassigned-profile", "Administración todavía no te asignó una sucursal.");
  }
  return profile;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (!error) return;
  // A failed global revoke must not leave a reusable persisted token on the
  // device. The caller still receives the original error for observability.
  await supabase.auth.signOut({ scope: "local" });
  throw error;
}

export function isRole(value: string): value is Role {
  return (ROLE_VALUES as readonly string[]).includes(value);
}
