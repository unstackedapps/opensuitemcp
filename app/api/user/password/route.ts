import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { changeUserPassword } from "@/lib/auth/change-password";
import { getUserById } from "@/lib/db/queries";
import { allowAuthAttempt } from "@/lib/rate-limit";

const passwordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6).max(128),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = passwordSchema.parse(body);
    const user = await getUserById(session.user.id);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!(await allowAuthAttempt(user.email))) {
      return NextResponse.json(
        { error: "Too many attempts." },
        { status: 429 },
      );
    }

    const requiresCurrentPassword =
      Boolean(user.password) && !user.mustResetPassword;
    if (requiresCurrentPassword && !validated.currentPassword?.trim()) {
      return NextResponse.json(
        { error: "Current password is required." },
        { status: 400 },
      );
    }

    const result = await changeUserPassword({
      userId: session.user.id,
      currentPassword: validated.currentPassword,
      newPassword: validated.newPassword,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid password." }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Failed to update password." },
      { status: 500 },
    );
  }
}
