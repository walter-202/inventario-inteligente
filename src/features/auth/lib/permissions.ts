import type { Role } from "./authTypes";

export type Ability =
  | "dashboard.read"
  | "inventory.read"
  | "inventory.write"
  | "products.read"
  | "products.write"
  | "sales.read"
  | "sales.write"
  | "movements.write"
  | "ai.read"
  | "users.manage";

export type BranchScope = "any" | "own" | "aggregate" | "none";

const POLICY: Record<Role, Partial<Record<Ability, BranchScope>>> = {
  admin: {
    "dashboard.read": "any",
    "inventory.read": "any",
    "products.read": "any",
    "sales.read": "any",
    "ai.read": "any",
    "users.manage": "any",
  },
  encargada: {
    "dashboard.read": "own",
    "inventory.read": "any",
    "inventory.write": "own",
    "products.read": "any",
    "sales.read": "own",
    "sales.write": "own",
    "movements.write": "own",
    "ai.read": "own",
  },
  cajera: {
    "inventory.read": "any",
    "products.read": "any",
    "sales.read": "own",
    "sales.write": "own",
    "ai.read": "own",
  },
  vendedora: {
    "inventory.read": "any",
    "products.read": "any",
    "sales.read": "own",
    "sales.write": "own",
    "ai.read": "own",
  },
  almacen: {
    "inventory.read": "any",
    "inventory.write": "own",
    "products.read": "any",
    "products.write": "own",
    "movements.write": "own",
    "ai.read": "own",
  },
  reponedora: {
    "inventory.read": "any",
    "products.read": "any",
    "ai.read": "own",
  },
  marketing: {
    "dashboard.read": "aggregate",
    "ai.read": "aggregate",
  },
};

export function branchScopeFor(role: Role, ability: Ability): BranchScope {
  return POLICY[role][ability] ?? "none";
}

export function can(role: Role | null | undefined, ability: Ability): boolean {
  return role ? branchScopeFor(role, ability) !== "none" : false;
}

export function assignedBranchIds(
  assignedBranchId: number | null | undefined,
  assignedBranchIdsList?: number[] | null,
): number[] {
  if (assignedBranchIdsList?.length) return assignedBranchIdsList;
  if (assignedBranchId !== null && assignedBranchId !== undefined) return [assignedBranchId];
  return [];
}

export function canUseBranch(
  role: Role | null | undefined,
  ability: Ability,
  requestedBranchId: number | null | undefined,
  assignedBranchId: number | null | undefined,
  assignedBranchIdsList?: number[] | null,
): boolean {
  if (!role) return false;
  const scope = branchScopeFor(role, ability);
  if (scope === "none") return false;
  if (scope === "any" || scope === "aggregate") return true;
  if (requestedBranchId === null || requestedBranchId === undefined) return false;
  return assignedBranchIds(assignedBranchId, assignedBranchIdsList).includes(requestedBranchId);
}

export function canSelectBranch(
  role: Role | null | undefined,
  assignedBranchIdsList?: number[] | null,
): boolean {
  if (isGlobalRole(role)) return true;
  return assignedBranchIds(undefined, assignedBranchIdsList).length > 1;
}

/** Whether the role operates globally without a fixed branch assignment. */
export function isGlobalRole(role: Role | null | undefined): boolean {
  return role === "admin";
}

export const roleLabels: Record<Role, string> = {
  admin: "Administrador",
  encargada: "Encargada",
  cajera: "Cajera",
  vendedora: "Asesora de venta",
  almacen: "Almacén",
  reponedora: "Reponedora",
  marketing: "Marketing",
};

export const roleColors: Record<Role, string> = {
  admin: "#7C3AED",
  encargada: "#2563EB",
  cajera: "#059669",
  vendedora: "#059669",
  almacen: "#D97706",
  reponedora: "#4B5563",
  marketing: "#DB2777",
};

