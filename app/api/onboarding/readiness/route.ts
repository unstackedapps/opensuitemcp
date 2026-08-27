import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { isOnboardingCompleteForSession } from "@/lib/onboarding/completion";
import {
  canAccessOnboarding,
  getOnboardingReadiness,
} from "@/lib/onboarding/readiness";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await canAccessOnboarding(session))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const completed = await isOnboardingCompleteForSession(session);
  if (completed) {
    return NextResponse.json({ completed: true });
  }

  const readiness = await getOnboardingReadiness(session);
  if (!readiness) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ ...readiness, completed: false });
}
