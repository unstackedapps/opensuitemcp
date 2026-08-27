import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getUserSettings } from "@/lib/db/queries";
import { resolveRequestedNetSuiteAccountId } from "@/lib/netsuite/accounts";
import { fetchMCPTools } from "@/lib/netsuite/mcp";
import {
  fallbackMcpToolLabel,
  isMcpToolAllowed,
  isMcpToolInDisabledList,
} from "@/lib/netsuite/mcp-tool-settings";
import { getNetSuiteToken } from "@/lib/netsuite/tokens";
import { isOrgInstallMode } from "@/lib/org/install-config";
import {
  getOrgMcpDisabledToolNames,
  resolveEffectiveNetsuiteMcpToolSettings,
} from "@/lib/org/mcp-tool-policy";

/**
 * GET /api/netsuite/mcp-tools?accountId=
 * Lists MCP tools for a specific NetSuite account (defaults to active),
 * with that account's Allowed/Disabled state.
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

  const orgDisabled =
    isOrgInstallMode() && session.user.orgId
      ? await getOrgMcpDisabledToolNames({
          orgId: session.user.orgId,
          accountId,
        })
      : [];
  const effectiveSettings = await resolveEffectiveNetsuiteMcpToolSettings({
    orgId: session.user.orgId,
    accountId,
    userSettings: settings?.netsuiteMcpTools,
  });
  const orgMcpToolsManaged = isOrgInstallMode() && Boolean(session.user.orgId);

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
      orgMcpToolsManaged,
      tools: rawTools.map((tool) => {
        const label = fallbackMcpToolLabel(tool);
        const orgDisabledTool = isMcpToolInDisabledList(orgDisabled, tool.name);
        return {
          originalName: tool.name,
          displayName: label.displayName,
          description: label.description,
          orgDisabled: orgDisabledTool,
          allowed: orgDisabledTool
            ? false
            : isMcpToolAllowed(effectiveSettings, accountId, tool.name),
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
