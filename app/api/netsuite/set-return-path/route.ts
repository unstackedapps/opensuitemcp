import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { isSafeAppPath } from "@/lib/http/public-origin";

const schema = z.object({
  returnPath: z.string().min(1).max(512),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { returnPath } = schema.parse(await request.json());
    if (!isSafeAppPath(returnPath)) {
      return NextResponse.json(
        { error: "Invalid return path" },
        { status: 400 },
      );
    }

    const cookieStore = await cookies();
    cookieStore.set("netsuite_return_path", returnPath, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to set return path" },
      { status: 500 },
    );
  }
}
