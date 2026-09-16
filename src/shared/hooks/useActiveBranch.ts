import { useCallback, useEffect, useState } from "react";

import { useAuth } from "../../features/auth/hooks/useAuth";
import { canSelectBranch } from "../../features/auth/lib/permissions";

export function resolveActiveBranchId(
  role: Parameters<typeof canSelectBranch>[0],
  assignedBranchId: number | null | undefined,
  selectedBranchId: number | null | undefined,
): number | null {
  if (role === "admin") return selectedBranchId ?? null;
  return assignedBranchId ?? null;
}

/** The server-assigned branch is authoritative for every non-admin account. */
export function useActiveBranch() {
  const { profile } = useAuth();
  const canChangeBranch = canSelectBranch(profile?.rol);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);

  useEffect(() => {
    setSelectedBranchId(profile?.rol === "admin" ? null : profile?.sucursal_id ?? null);
  }, [profile?.rol, profile?.sucursal_id]);

  const activeBranchId = resolveActiveBranchId(profile?.rol, profile?.sucursal_id, selectedBranchId);
  const selectBranch = useCallback((branchId: number | null) => {
    if (canChangeBranch) setSelectedBranchId(branchId);
  }, [canChangeBranch]);

  return {
    activeBranchId,
    canChangeBranch,
    selectBranch,
    isGlobal: activeBranchId === null && (profile?.rol === "admin" || profile?.rol === "marketing"),
  };
}
