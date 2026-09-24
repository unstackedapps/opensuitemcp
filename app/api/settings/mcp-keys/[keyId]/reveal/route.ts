import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { revealMcpApiKey } from "@/lib/mcp/server/keys";

/**
 * Return an agent's key to the person who owns it, so they can copy it again.
 *
 * Owner-scoped and never cached: this is the one response in the app that
 * carries a live credential, and it exists so a key is not lost to a dismissed
 * dialog. The UI copies it to the clipboard and never renders it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ keyId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { keyId } = await params;
  const token = await revealMcpApiKey({ userId: session.user.id, keyId });
  if (!token) {
    return NextResponse.json(
      {
        error:
          "This key cannot be copied. It was created before keys were recoverable — use Replace to get one that is.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { token },
    { headers: { "Cache-Control": "no-store" } },
  );
}
