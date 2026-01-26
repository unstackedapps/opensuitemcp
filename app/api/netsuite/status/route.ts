import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { loadNetSuiteMCPTools } from "@/lib/netsuite/mcp";
import { getNetSuiteToken } from "@/lib/netsuite/tokens";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ connected: false }, { status: 401 });
  }

  const accessToken = await getNetSuiteToken(session.user.id);
  const isConnected = !!accessToken;

  // Also check if tools are available
  let toolCount = 0;
  if (isConnected) {
    try {
      const tools = await loadNetSuiteMCPTools(session.user.id);
      toolCount = Object.keys(tools).length;
    } catch (error) {
      console.error("[NetSuite Status] Error loading tools:", error);
    }
  }

  return NextResponse.json({
    connected: isConnected,
    toolCount,
  });
}
