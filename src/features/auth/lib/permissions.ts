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
  | "ai.read";

export type BranchScope = "any" | "own" | "aggregate" | "none";

const POLICY: Record<Role, Partial<Record<Ability, BranchScope>>> = {
  admin: {
    "dashboard.read": "any",
    "inventory.read": "any",
    "inventory.write": "any",
    "products.read": "any",
    "products.write": "any",
    "sales.read": "any",
    "sales.write": "any",
    "movements.write": "any",
    "ai.read": "any",
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

export function canUseBranch(
  role: Role | null | undefined,
  ability: Ability,
  requestedBranchId: number | null | undefined,
  assignedBranchId: number | null | undefined,
): boolean {
  if (!role) return false;
  const scope = branchScopeFor(role, ability);
  if (scope === "none") return false;
  if (scope === "any" || scope === "aggregate") return true;
  return requestedBranchId !== null && requestedBranchId !== undefined && requestedBranchId === assignedBranchId;
}

export function canSelectBranch(role: Role | null | undefined): boolean {
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
