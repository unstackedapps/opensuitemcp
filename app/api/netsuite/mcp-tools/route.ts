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

type CatalogTool = {
  originalName: string;
  displayName: string;
  description: string;
};

const toolsCatalogCache = new Map<
  string,
  { tools: CatalogTool[]; timestamp: number }
>();

const CACHE_TTL = 1000 * 60 * 30;

function cacheKey(userId: string, accountId: string): string {
  return `${userId}:${accountId}`;
}

/**
 * GET /api/netsuite/mcp-tools?accountId=
 * Lists MCP tools for a specific NetSuite account (defaults to active),
 * with that account's Allowed/Disabled state.
 * Labels come from NetSuite metadata / local fallback — no AI calls.
 */
export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getUserSettings({ userId: session.user.id });
  const requestedAccountId = new URL(request.url).searchParams.get("accountId");
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
    const now = Date.now();
    const key = cacheKey(session.user.id, accountId);
    let catalog = toolsCatalogCache.get(key);
    if (!catalog || now - catalog.timestamp >= CACHE_TTL) {
      const rawTools = await fetchMCPTools(
        session.user.id,
        accessToken,
        accountId,
      );
      if (rawTools.length === 0) {
        return NextResponse.json({
          connected: true,
          accountId,
          tools: [],
        });
      }

      const tools = rawTools.map((tool) => {
        const label = fallbackMcpToolLabel(tool);
        return {
          originalName: tool.name,
          displayName: label.displayName,
          description: label.description,
        };
      });

      catalog = { tools, timestamp: now };
      toolsCatalogCache.set(key, catalog);

      for (const [entryKey, entry] of toolsCatalogCache.entries()) {
        if (now - entry.timestamp > CACHE_TTL * 2) {
          toolsCatalogCache.delete(entryKey);
        }
      }
    }

    return NextResponse.json({
      connected: true,
      accountId,
      tools: catalog.tools.map((tool) => ({
        originalName: tool.originalName,
        displayName: tool.displayName,
        description: tool.description,
        allowed: isMcpToolAllowed(
          settings?.netsuiteMcpTools,
          accountId,
          tool.originalName,
        ),
      })),
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
