export const AUTHENTICATED_HOME_ROUTE = "/" as const;

export type PermissionDeniedNavigation =
  | { type: "back" }
  | { type: "replace"; href: typeof AUTHENTICATED_HOME_ROUTE };

export function getPermissionDeniedNavigation(
  canGoBack: boolean,
): PermissionDeniedNavigation {
  return canGoBack
    ? { type: "back" }
    : { type: "replace", href: AUTHENTICATED_HOME_ROUTE };
}
