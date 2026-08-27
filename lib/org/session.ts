import type { Session } from "next-auth";
import type { OrgRole } from "@/lib/db/schema";
import { isOrgAdminRole, isOrgOwnerRole } from "./types";

export type OrgSessionUser = {
  id: string;
  orgId: string | null;
  role: OrgRole | null;
};

export function getOrgSessionUser(
  session: Session | null,
): OrgSessionUser | null {
  if (!session?.user?.id) {
    return null;
  }

  return {
    id: session.user.id,
    orgId: session.user.orgId ?? null,
    role: session.user.role ?? null,
  };
}

export function sessionIsOrgAdmin(session: Session | null): boolean {
  const user = getOrgSessionUser(session);
  return isOrgAdminRole(user?.role);
}

export function sessionIsOrgOwner(session: Session | null): boolean {
  const user = getOrgSessionUser(session);
  return isOrgOwnerRole(user?.role);
}
