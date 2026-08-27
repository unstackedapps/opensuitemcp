import "server-only";

import { eq } from "drizzle-orm";
import type { Session } from "next-auth";
import { db } from "@/lib/db/client";
import { org, user } from "@/lib/db/schema";
import { isOrgInstallMode } from "@/lib/org/install-config";
import { getUserOrgContext } from "@/lib/org/queries";
import { sessionIsOrgAdmin } from "@/lib/org/session";

export function getPostOnboardingRedirectPath(session: Session): string {
  if (isOrgInstallMode() && sessionIsOrgAdmin(session)) {
    return "/admin";
  }
  return "/";
}

export async function isOnboardingCompleteForSession(
  session: Session | null,
): Promise<boolean> {
  if (!session?.user?.id) {
    return true;
  }

  if (isOrgInstallMode()) {
    if (!sessionIsOrgAdmin(session) || !session.user.orgId) {
      return true;
    }

    const [row] = await db
      .select({ onboardingCompletedAt: org.onboardingCompletedAt })
      .from(org)
      .where(eq(org.id, session.user.orgId))
      .limit(1);

    return Boolean(row?.onboardingCompletedAt);
  }

  const [row] = await db
    .select({ onboardingCompletedAt: user.onboardingCompletedAt })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  return Boolean(row?.onboardingCompletedAt);
}

export async function needsOnboardingForSession(
  session: Session | null,
): Promise<boolean> {
  if (!session?.user?.id) {
    return false;
  }

  return !(await isOnboardingCompleteForSession(session));
}

export async function markOnboardingCompleteForUser(
  userId: string,
): Promise<void> {
  if (isOrgInstallMode()) {
    const orgContext = await getUserOrgContext(userId);
    if (
      !orgContext ||
      (orgContext.role !== "owner" && orgContext.role !== "admin")
    ) {
      return;
    }

    await db
      .update(org)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(org.id, orgContext.orgId));
    return;
  }

  await db
    .update(user)
    .set({ onboardingCompletedAt: new Date() })
    .where(eq(user.id, userId));
}
