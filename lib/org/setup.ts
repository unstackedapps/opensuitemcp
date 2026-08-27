import "server-only";

import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { isOrgInstallMode } from "@/lib/org/install-config";
import { getDefaultOrg, hasOrgOwner } from "@/lib/org/queries";
import { sessionIsOrgAdmin } from "@/lib/org/session";

/** True when this is an org install and no owner exists yet. */
export async function needsOrgSetup(): Promise<boolean> {
  if (!isOrgInstallMode()) {
    return false;
  }

  const defaultOrg = await getDefaultOrg();
  if (!defaultOrg) {
    return true;
  }
  return !(await hasOrgOwner(defaultOrg.id));
}

export async function redirectIfNeedsOrgSetup(): Promise<void> {
  if (await needsOrgSetup()) {
    redirect("/setup");
  }
}

export async function redirectIfOrgReady(): Promise<void> {
  if (!(await needsOrgSetup())) {
    redirect("/login");
  }
}

export async function requireOrgAdminSession(session: Session | null): Promise<{
  orgId: string;
  userId: string;
  role: NonNullable<Session["user"]["role"]>;
}> {
  if (!isOrgInstallMode()) {
    redirect("/");
  }

  await redirectIfNeedsOrgSetup();

  if (!session?.user?.id || !session.user.orgId || !session.user.role) {
    redirect("/");
  }

  if (!sessionIsOrgAdmin(session)) {
    redirect("/");
  }

  return {
    orgId: session.user.orgId,
    userId: session.user.id,
    role: session.user.role,
  };
}
