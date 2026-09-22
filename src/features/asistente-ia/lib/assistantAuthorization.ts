import { can, canUseBranch, type Ability } from "../../auth/lib/permissions";
import type { UserProfile } from "../../auth/lib/authTypes";

export interface AssistantBranch {
  id: number;
  nombre: string;
}

export interface AssistantScopeContext {
  userId: string;
  role: UserProfile["rol"];
  abilities: Ability[];
  activeBranchId: number | null;
  activeBranchName: string | null;
  allowedBranchIds: number[];
  allowedBranchNames: string[];
}

const CONTEXT_ABILITIES: Ability[] = [
  "dashboard.read",
  "inventory.read",
  "inventory.write",
  "products.read",
  "products.write",
  "sales.read",
  "sales.write",
  "movements.write",
  "ai.read",
  "users.manage",
];

export function allowedAssistantBranches(profile: UserProfile | null | undefined, branches: AssistantBranch[]): AssistantBranch[] {
  if (!profile || !can(profile.rol, "ai.read")) return [];
  return branches.filter((branch) => canUseBranch(profile.rol, "ai.read", branch.id, profile.sucursal_id));
}

/** Never selects a global branch outside the authenticated user's AI scope. */
export function resolveAssistantBranch(
  profile: UserProfile | null | undefined,
  branches: AssistantBranch[],
  requestedBranchId: number | null | undefined,
): number | null {
  const allowed = allowedAssistantBranches(profile, branches);
  if (requestedBranchId !== null && requestedBranchId !== undefined && allowed.some((branch) => branch.id === requestedBranchId)) {
    return requestedBranchId;
  }
  if (profile?.sucursal_id !== null && profile?.sucursal_id !== undefined && allowed.some((branch) => branch.id === profile.sucursal_id)) {
    return profile.sucursal_id;
  }
  return allowed[0]?.id ?? null;
}

export function buildAssistantScopeContext(
  profile: UserProfile | null | undefined,
  branches: AssistantBranch[],
  requestedBranchId: number | null | undefined,
): AssistantScopeContext | null {
  if (!profile) return null;
  const allowed = allowedAssistantBranches(profile, branches);
  const activeBranchId = resolveAssistantBranch(profile, branches, requestedBranchId);
  const activeBranch = allowed.find((branch) => branch.id === activeBranchId) ?? null;
  return {
    userId: profile.id,
    role: profile.rol,
    abilities: CONTEXT_ABILITIES.filter((ability) => can(profile.rol, ability)),
    activeBranchId,
    activeBranchName: activeBranch?.nombre ?? null,
    allowedBranchIds: allowed.map((branch) => branch.id),
    allowedBranchNames: allowed.map((branch) => branch.nombre),
  };
}

/** Fresh authorization guard immediately before an assistant-originated write. */
export function canExecuteAssistantWrite(
  profile: UserProfile | null | undefined,
  ability: Extract<Ability, "products.write" | "sales.write">,
  branchId: number | null | undefined,
): boolean {
  return Boolean(profile && canUseBranch(profile.rol, ability, branchId, profile.sucursal_id));
}
