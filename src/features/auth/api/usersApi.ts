import { supabase } from "../../../shared/lib/supabase";
import type { Role } from "../lib/authTypes";
import { assignedBranchIds, isGlobalRole } from "../lib/permissions";
import { DEFAULT_COLLABORATOR_PASSWORD, MIN_PASSWORD_LENGTH } from "../../../shared/lib/constants";

export interface UserProfileItem {
  id: string;
  email: string | null;
  nombre: string | null;
  rol: Role;
  sucursal_id: number | null;
  sucursal_ids: number[];
  sucursal_nombre?: string;
  created_at: string;
  updated_at: string;
}

type BranchAssignmentRow = {
  perfil_id: string;
  sucursal_id: number;
  sucursales?: { nombre: string } | null;
};

function formatBranchNames(
  rol: Role,
  primaryBranchName: string | undefined,
  branchAssignments: Array<{ sucursal_id: number; sucursales?: { nombre: string } | null }> | null | undefined,
): string {
  if (isGlobalRole(rol)) return "Global / Todas";
  const names = (branchAssignments ?? [])
    .map((row) => row.sucursales?.nombre)
    .filter((name): name is string => Boolean(name));
  if (names.length > 0) return names.join(", ");
  return primaryBranchName ?? "Sin asignar";
}

async function fetchBranchAssignmentsByUser(userIds: string[]): Promise<Map<string, BranchAssignmentRow[]>> {
  if (userIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("perfil_sucursales")
    .select(`
      perfil_id,
      sucursal_id,
      sucursales:sucursal_id (
        nombre
      )
    `)
    .in("perfil_id", userIds)
    .order("sucursal_id", { ascending: true });

  if (error) return new Map();

  const grouped = new Map<string, BranchAssignmentRow[]>();
  for (const row of (data ?? []) as BranchAssignmentRow[]) {
    const current = grouped.get(row.perfil_id) ?? [];
    current.push(row);
    grouped.set(row.perfil_id, current);
  }
  return grouped;
}

function isMissingMultiBranchRpc(error: { message?: string } | null): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("could not find the function") && message.includes("p_sucursal_ids");
}

function assertLegacySingleBranchSupported(rol: Role, sucursalIds: number[]): void {
  if (isGlobalRole(rol) || sucursalIds.length <= 1) return;
  throw new Error(
    "Seleccionaste varias sucursales, pero la base de datos todavía no tiene la migración multi-sucursal. Ejecutá supabase db push o elegí una sola sucursal.",
  );
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

  const rows = data ?? [];
  const assignmentsByUser = await fetchBranchAssignmentsByUser(rows.map((row) => row.id));

  return rows.map((row: any) => {
    const branchAssignments = assignmentsByUser.get(row.id) ?? null;
    const junctionIds = branchAssignments?.map((assignment) => assignment.sucursal_id) ?? null;
    const resolvedBranchIds = assignedBranchIds(row.sucursal_id, junctionIds);

    return {
      id: row.id,
      email: row.email,
      nombre: row.nombre,
      rol: row.rol as Role,
      sucursal_id: row.sucursal_id,
      sucursal_ids: resolvedBranchIds,
      sucursal_nombre: formatBranchNames(row.rol as Role, row.sucursales?.nombre, branchAssignments),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
}

export async function updateUserProfile(
  userId: string,
  rol: Role,
  sucursalIds: number[],
): Promise<{ success: boolean }> {
  const primaryBranchId = isGlobalRole(rol) ? null : sucursalIds[0] ?? null;
  let { error } = await supabase.rpc("admin_actualizar_perfil", {
    p_user_id: userId,
    p_rol: rol,
    p_sucursal_id: primaryBranchId as any,
    p_sucursal_ids: isGlobalRole(rol) ? null : sucursalIds,
  });

  if (error && isMissingMultiBranchRpc(error)) {
    assertLegacySingleBranchSupported(rol, sucursalIds);
    ({ error } = await supabase.rpc("admin_actualizar_perfil", {
      p_user_id: userId,
      p_rol: rol,
      p_sucursal_id: primaryBranchId as any,
    }));
  }

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
  sucursalIds: number[],
): Promise<{ success: boolean }> {
  const primaryBranchId = isGlobalRole(rol) ? null : sucursalIds[0] ?? null;
  let { error } = await supabase.rpc("admin_crear_perfil", {
    p_id: id,
    p_email: email,
    p_nombre: nombre,
    p_rol: rol,
    p_sucursal_id: primaryBranchId as any,
    p_sucursal_ids: isGlobalRole(rol) ? null : sucursalIds,
  });

  if (error && isMissingMultiBranchRpc(error)) {
    assertLegacySingleBranchSupported(rol, sucursalIds);
    ({ error } = await supabase.rpc("admin_crear_perfil", {
      p_id: id,
      p_email: email,
      p_nombre: nombre,
      p_rol: rol,
      p_sucursal_id: primaryBranchId as any,
    }));
  }

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
  sucursalIds: number[];
}): Promise<{ success: boolean; id: string }> {
  const primaryBranchId = isGlobalRole(params.rol) ? null : params.sucursalIds[0] ?? null;
  let { data, error } = await supabase.rpc("admin_crear_usuario", {
    p_email: params.email,
    p_password: params.password || DEFAULT_COLLABORATOR_PASSWORD,
    p_nombre: params.nombre,
    p_rol: params.rol,
    p_sucursal_id: primaryBranchId as any,
    p_sucursal_ids: isGlobalRole(params.rol) ? null : params.sucursalIds,
  });

  if (error && isMissingMultiBranchRpc(error)) {
    assertLegacySingleBranchSupported(params.rol, params.sucursalIds);
    ({ data, error } = await supabase.rpc("admin_crear_usuario", {
      p_email: params.email,
      p_password: params.password || DEFAULT_COLLABORATOR_PASSWORD,
      p_nombre: params.nombre,
      p_rol: params.rol,
      p_sucursal_id: primaryBranchId as any,
    }));
  }

  if (error) {
    if (error.message.includes("EMAIL_ALREADY_EXISTS")) {
      throw new Error("El correo electrónico ya está registrado en el sistema.");
    }
    if (error.message.includes("INVALID_EMAIL")) {
      throw new Error("El formato del correo electrónico no es válido.");
    }
    if (error.message.includes("PASSWORD_TOO_SHORT")) {
      throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }
    throw new Error(`Error al crear colaborador: ${error.message}`);
  }

  const result = data as any;
  return { success: true, id: result?.id };
}
