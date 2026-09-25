import { useCallback, useEffect, useState } from "react";

import { useAuth } from "../../features/auth/hooks/useAuth";
import { assignedBranchIds, canSelectBranch, isGlobalRole } from "../../features/auth/lib/permissions";

export function resolveActiveBranchId(
  role: Parameters<typeof canSelectBranch>[0],
  assignedBranchId: number | null | undefined,
  selectedBranchId: number | null | undefined,
  assignedBranchIdsList?: number[] | null,
): number | null {
  const allowed = assignedBranchIds(assignedBranchId, assignedBranchIdsList);
  if (isGlobalRole(role)) return selectedBranchId ?? null;
  if (selectedBranchId !== null && selectedBranchId !== undefined && allowed.includes(selectedBranchId)) {
    return selectedBranchId;
  }
  return assignedBranchId ?? allowed[0] ?? null;
}

/** The server-assigned branches are authoritative for every non-admin account. */
export function useActiveBranch() {
  const { profile } = useAuth();
  const allowedBranches = profile?.sucursal_ids ?? assignedBranchIds(profile?.sucursal_id);
  const canChangeBranch = canSelectBranch(profile?.rol, allowedBranches);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);

  useEffect(() => {
    if (isGlobalRole(profile?.rol)) {
      setSelectedBranchId(null);
      return;
    }
    setSelectedBranchId(profile?.sucursal_id ?? allowedBranches[0] ?? null);
  }, [profile?.rol, profile?.sucursal_id, allowedBranches.join(",")]);

  const activeBranchId = resolveActiveBranchId(
    profile?.rol,
    profile?.sucursal_id,
    selectedBranchId,
    allowedBranches,
  );
  const selectBranch = useCallback((branchId: number | null) => {
    if (!canChangeBranch) return;
    if (branchId !== null && !allowedBranches.includes(branchId)) return;
    setSelectedBranchId(branchId);
  }, [allowedBranches, canChangeBranch]);

  return {
    activeBranchId,
    allowedBranchIds: allowedBranches,
    canChangeBranch,
    selectBranch,
    isGlobal: activeBranchId === null && (isGlobalRole(profile?.rol) || profile?.rol === "marketing"),
  };
}
