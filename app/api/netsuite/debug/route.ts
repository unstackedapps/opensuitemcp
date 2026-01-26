import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { db } from "@/lib/db/queries";
import { netsuiteToken } from "@/lib/db/schema";
import { loadNetSuiteMCPTools } from "@/lib/netsuite/mcp";
import { getNetSuiteToken } from "@/lib/netsuite/tokens";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = session.user.id;

  // Check for token in database
  const [token] = await db
    .select()
    .from(netsuiteToken)
    .where(eq(netsuiteToken.userId, userId))
    .limit(1);

  const debugInfo = {
    userId,
    hasTokenInDb: !!token,
    tokenExpiresAt: token?.expiresAt
      ? new Date(token.expiresAt).toISOString()
      : null,
    tokenIsExpired: token
      ? new Date(token.expiresAt).getTime() < Date.now()
      : null,
    accessToken: (await getNetSuiteToken(userId)) ? "present" : "missing",
  };

  // Try to load tools
  try {
    const tools = await loadNetSuiteMCPTools(userId);
    return NextResponse.json({
      ...debugInfo,
      toolsLoaded: Object.keys(tools).length,
      toolNames: Object.keys(tools),
    });
  } catch (error) {
    return NextResponse.json({
      ...debugInfo,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}
