import "server-only";

import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import {
  canAccessOnboarding,
  getOnboardingReadiness,
} from "@/lib/onboarding/readiness";
import {
  getPostOnboardingRedirectPath,
  isOnboardingCompleteForSession,
} from "./completion";

export async function redirectIfOnboardingComplete(): Promise<void> {
  const { auth } = await import("@/app/(auth)/auth");
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (await isOnboardingCompleteForSession(session)) {
    redirect(getPostOnboardingRedirectPath(session));
  }
}

export async function redirectIfNeedsOnboarding(
  session: Session | null,
): Promise<void> {
  if (!session?.user?.id) {
    return;
  }

  if (!(await canAccessOnboarding(session))) {
    return;
  }

  if (await isOnboardingCompleteForSession(session)) {
    return;
  }

  redirect("/onboarding");
}

export async function getOnboardingPageData(session: Session) {
  const readiness = await getOnboardingReadiness(session);
  if (!readiness) {
    return null;
  }

  return readiness;
}
