import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { unlinkUserOidcLoginEmail } from "@/lib/auth/user-oidc-login-emails";
import { isSoloInstallMode } from "@/lib/org/install-config";

const unlinkSchema = z.object({
  email: z.string().min(3).max(64),
});

export async function DELETE(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSoloInstallMode()) {
    return NextResponse.json(
      { error: "NetSuite login emails can only be managed in solo mode." },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const validated = unlinkSchema.parse(body);

    await unlinkUserOidcLoginEmail({
      userId: session.user.id,
      email: validated.email,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid email." }, { status: 400 });
    }

    const message =
      error instanceof Error
        ? error.message
        : "Failed to remove NetSuite login email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
