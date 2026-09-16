/**
 * Nombres de sucursal como "Lidemoda La Paz - Sucursal Comercio" son
 * demasiado largos para pills/chips. Esto los recorta a "Comercio".
 */
export function formatBranchName(rawName: string): string {
  const short = rawName
    .replace(/^Lidemoda\s+(?:La\s+Paz\s*[-–]?\s*)?(?:Sucursal\s*)?/i, "")
    .replace(/^(?:La\s+Paz\s*[-–]?\s*)?(?:Sucursal\s*)/i, "")
    .trim();
  return short || rawName;
}
