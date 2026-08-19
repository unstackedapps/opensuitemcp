import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getUserSettings } from "@/lib/db/queries";
import { resolveRequestedNetSuiteAccountId } from "@/lib/netsuite/accounts";
import { fetchMCPTools } from "@/lib/netsuite/mcp";
import {
  fallbackMcpToolLabel,
  isMcpToolAllowed,
} from "@/lib/netsuite/mcp-tool-settings";
import { getNetSuiteToken } from "@/lib/netsuite/tokens";

/**
 * GET /api/netsuite/mcp-tools?accountId=
 * Lists MCP tools for a specific NetSuite account (defaults to active),
 * with that account's Allowed/Disabled state.
 * Labels come from NetSuite metadata / local fallback — no AI calls.
 * Pass refresh=1 to bypass the shared tools/list cache.
 */
export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getUserSettings({ userId: session.user.id });
  const requestUrl = new URL(request.url);
  const requestedAccountId = requestUrl.searchParams.get("accountId");
  const forceRefresh = requestUrl.searchParams.get("refresh") === "1";
  const accountId = resolveRequestedNetSuiteAccountId({
    requested: requestedAccountId,
    activeAccountId: settings?.netsuiteAccountId,
  });
  const accessToken = accountId
    ? await getNetSuiteToken(session.user.id, accountId)
    : null;

  if (!(accountId && accessToken)) {
    return NextResponse.json({
      connected: false,
      accountId,
      tools: [],
    });
  }

  try {
    const rawTools = await fetchMCPTools(
      session.user.id,
      accessToken,
      accountId,
      { forceRefresh },
    );

    return NextResponse.json({
      connected: true,
      accountId,
      tools: rawTools.map((tool) => {
        const label = fallbackMcpToolLabel(tool);
        return {
          originalName: tool.name,
          displayName: label.displayName,
          description: label.description,
          allowed: isMcpToolAllowed(
            settings?.netsuiteMcpTools,
            accountId,
            tool.name,
          ),
        };
      }),
    });
  } catch (error) {
    console.error("[MCP Tools API] Error fetching tools:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch MCP tools",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    );
  }
}
