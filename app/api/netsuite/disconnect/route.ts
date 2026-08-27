import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getUserSettings } from "@/lib/db/queries";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";
import { invalidateMcpToolsListCache } from "@/lib/netsuite/mcp";
import { deleteNetSuiteToken } from "@/lib/netsuite/tokens";

const bodySchema = z.object({
  accountId: z.string().min(1).max(64).optional(),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getUserSettings({ userId: session.user.id });
    const activeAccountId = settings?.netsuiteAccountId
      ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
      : null;

    let requestedAccountId: string | null = null;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const raw = await request.json().catch(() => ({}));
      const parsed = bodySchema.parse(raw ?? {});
      requestedAccountId = parsed.accountId?.trim()
        ? normalizeNetSuiteAccountId(parsed.accountId)
        : null;
    }

    const accountId = requestedAccountId || activeAccountId;
    if (!accountId) {
      return NextResponse.json(
        { error: "No NetSuite connection specified to disconnect" },
        { status: 400 },
      );
    }

    await deleteNetSuiteToken(session.user.id, accountId);
    invalidateMcpToolsListCache(session.user.id, accountId);
    return NextResponse.json({ success: true, accountId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid disconnect request", details: error.errors },
        { status: 400 },
      );
    }
    console.error("[NetSuite Disconnect] Error:", error);
    return NextResponse.json(
      { error: "Failed to disconnect NetSuite connection" },
      { status: 500 },
    );
  }
}
