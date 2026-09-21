import { supabase } from "../../../shared/lib/supabase";
import type { Role } from "../lib/authTypes";

export interface UserProfileItem {
  id: string;
  email: string | null;
  nombre: string | null;
  rol: Role;
  sucursal_id: number | null;
  sucursal_nombre?: string;
  created_at: string;
  updated_at: string;
}

export async function fetchUserProfiles(): Promise<UserProfileItem[]> {
  const { data, error } = await supabase
    .from("perfiles")
    .select(`
      id,
      email,
      nombre,
      rol,
      sucursal_id,
      created_at,
      updated_at,
      sucursales:sucursal_id (
        nombre
      )
    `)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Error al obtener perfiles: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    email: row.email,
    nombre: row.nombre,
    rol: row.rol as Role,
    sucursal_id: row.sucursal_id,
    sucursal_nombre: row.sucursales?.nombre ?? (row.rol === "admin" ? "Global / Todas" : "Sin asignar"),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function updateUserProfile(
  userId: string,
  rol: Role,
  sucursalId: number | null,
): Promise<{ success: boolean }> {
  // Use our guarded RPC admin_actualizar_perfil
  const { data, error } = await supabase.rpc("admin_actualizar_perfil", {
    p_user_id: userId,
    p_rol: rol,
    p_sucursal_id: sucursalId as any,
  });

  if (error) {
    throw new Error(`Error al actualizar perfil de usuario: ${error.message}`);
  }

  return { success: true };
}

export async function createUserProfile(
  id: string,
  email: string,
  nombre: string,
  rol: Role,
  sucursalId: number | null,
): Promise<{ success: boolean }> {
  const { data, error } = await supabase.rpc("admin_crear_perfil", {
    p_id: id,
    p_email: email,
    p_nombre: nombre,
    p_rol: rol,
    p_sucursal_id: sucursalId as any,
  });

  if (error) {
    throw new Error(`Error al crear perfil de usuario: ${error.message}`);
  }

  return { success: true };
}

export async function createCollaboratorUser(params: {
  email: string;
  password?: string;
  nombre: string;
  rol: Role;
  sucursalId: number | null;
}): Promise<{ success: boolean; id: string }> {
  const { data, error } = await supabase.rpc("admin_crear_usuario", {
    p_email: params.email,
    p_password: params.password || "Lidemoda2026!",
    p_nombre: params.nombre,
    p_rol: params.rol,
    p_sucursal_id: params.rol === "admin" ? null : (params.sucursalId as any),
  });

  if (error) {
    if (error.message.includes("EMAIL_ALREADY_EXISTS")) {
      throw new Error("El correo electrónico ya está registrado en el sistema.");
    }
    if (error.message.includes("INVALID_EMAIL")) {
      throw new Error("El formato del correo electrónico no es válido.");
    }
    if (error.message.includes("PASSWORD_TOO_SHORT")) {
      throw new Error("La contraseña debe tener al menos 6 caracteres.");
    }
    throw new Error(`Error al crear colaborador: ${error.message}`);
  }

  const result = data as any;
  return { success: true, id: result?.id };
}

