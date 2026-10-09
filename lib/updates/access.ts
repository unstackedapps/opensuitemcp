import type { Session } from "next-auth";
import { isOrgInstallMode } from "@/lib/org/install-config";
import { sessionIsOrgAdmin } from "@/lib/org/session";

/**
 * Who may update this install from inside the app: an owner or admin on an
 * org install, and any signed-in account on a solo install, which has no
 * roles.
 */
export function canManageUpdates(session: Session | null): boolean {
  if (!session?.user?.id || session.user.type === "guest") {
    return false;
  }
  return isOrgInstallMode() ? sessionIsOrgAdmin(session) : true;
}
