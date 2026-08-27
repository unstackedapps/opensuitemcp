import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { org, user } from "@/lib/db/schema";
import { isOrgInstallMode } from "@/lib/org/install-config";
import { getUserOrgContext } from "@/lib/org/queries";
import type { OnboardingStepId } from "./types";

function normalizeViewedSteps(raw: unknown): OnboardingStepId[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const allowed = new Set<string>([
    "welcome",
    "oidc",
    "mcp",
    "oidc-extra",
    "llm",
    "persona",
    "connected-skills",
    "custom-skills",
    "search",
    "timezone",
    "users",
    "gates",
    "checklist",
  ]);

  return raw.filter(
    (step): step is OnboardingStepId =>
      typeof step === "string" && allowed.has(step),
  );
}

export async function getOnboardingViewedSteps(
  userId: string,
): Promise<OnboardingStepId[]> {
  if (isOrgInstallMode()) {
    const orgContext = await getUserOrgContext(userId);
    if (!orgContext) {
      return [];
    }

    const [row] = await db
      .select({ onboardingViewedSteps: org.onboardingViewedSteps })
      .from(org)
      .where(eq(org.id, orgContext.orgId))
      .limit(1);

    return normalizeViewedSteps(row?.onboardingViewedSteps);
  }

  const [row] = await db
    .select({ onboardingViewedSteps: user.onboardingViewedSteps })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return normalizeViewedSteps(row?.onboardingViewedSteps);
}

export async function markOnboardingStepViewed({
  userId,
  stepId,
}: {
  userId: string;
  stepId: OnboardingStepId;
}): Promise<OnboardingStepId[]> {
  const existing = await getOnboardingViewedSteps(userId);
  if (existing.includes(stepId)) {
    return existing;
  }

  const next = [...existing, stepId];

  if (isOrgInstallMode()) {
    const orgContext = await getUserOrgContext(userId);
    if (!orgContext) {
      return existing;
    }

    await db
      .update(org)
      .set({ onboardingViewedSteps: next })
      .where(eq(org.id, orgContext.orgId));

    return next;
  }

  await db
    .update(user)
    .set({ onboardingViewedSteps: next })
    .where(eq(user.id, userId));

  return next;
}

export async function canMarkOnboardingStepViewed(
  userId: string,
  orgId: string | null | undefined,
): Promise<boolean> {
  if (isOrgInstallMode()) {
    if (!orgId) {
      return false;
    }
    const orgContext = await getUserOrgContext(userId);
    return Boolean(
      orgContext &&
        orgContext.orgId === orgId &&
        (orgContext.role === "owner" || orgContext.role === "admin"),
    );
  }

  const orgContext = await getUserOrgContext(userId);
  return !orgContext;
}
