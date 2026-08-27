/** Public routes that do not require a session (self-host bootstrap + auth). */
export function isUnauthenticatedPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" || pathname === "/register" || pathname === "/setup"
  );
}

export {
  getUnauthenticatedRedirectPath,
  isGuestAuthEnabled,
  isOrgInstallMode,
} from "@/lib/org/install-config";
