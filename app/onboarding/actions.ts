"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import {
  getPostOnboardingRedirectPath,
  markOnboardingCompleteForUser,
} from "@/lib/onboarding/completion";
import { canAccessOnboarding } from "@/lib/onboarding/readiness";
import type { OnboardingStepId } from "@/lib/onboarding/types";
import {
  canMarkOnboardingStepViewed,
  markOnboardingStepViewed,
} from "@/lib/onboarding/viewed-steps";

export async function markOnboardingStepViewedAction(
  stepId: OnboardingStepId,
): Promise<{ ok: boolean; viewedSteps?: OnboardingStepId[]; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Unauthorized" };
  }

  if (!(await canAccessOnboarding(session))) {
    return { ok: false, error: "Onboarding is not available." };
  }

  if (
    !(await canMarkOnboardingStepViewed(
      session.user.id,
      session.user.orgId ?? null,
    ))
  ) {
    return { ok: false, error: "Forbidden" };
  }

  const viewedSteps = await markOnboardingStepViewed({
    userId: session.user.id,
    stepId,
  });

  revalidatePath("/onboarding");
  revalidatePath("/api/onboarding/readiness");

  return { ok: true, viewedSteps };
}

export async function completeOnboardingAction(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Unauthorized" };
  }

  if (!(await canAccessOnboarding(session))) {
    return { ok: false, error: "Onboarding is not available." };
  }

  await markOnboardingCompleteForUser(session.user.id);
  revalidatePath("/");
  revalidatePath("/onboarding");
  revalidatePath("/admin");
  redirect(getPostOnboardingRedirectPath(session));
}
