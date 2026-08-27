import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { fetchMCPTools } from "@/lib/netsuite/mcp";
import { fallbackMcpToolLabel } from "@/lib/netsuite/mcp-tool-settings";
import { getNetSuiteToken } from "@/lib/netsuite/tokens";
import { getAdminActor } from "@/lib/org/admin/actor";
import { getOrgMcpDisabledToolNames } from "@/lib/org/mcp-tool-policy";
import { getOrgNetSuiteMcpAccountById } from "@/lib/org/netsuite-mcp-accounts";
import { sessionIsOrgAdmin } from "@/lib/org/session";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !sessionIsOrgAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = await getAdminActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const netsuiteMcpAccountId = new URL(request.url).searchParams.get(
    "netsuiteMcpAccountId",
  );
  if (!netsuiteMcpAccountId) {
    return NextResponse.json(
      { error: "netsuiteMcpAccountId is required" },
      { status: 400 },
    );
  }

  const account = await getOrgNetSuiteMcpAccountById({
    orgId: actor.orgId,
    netsuiteMcpAccountId,
  });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const accessToken = await getNetSuiteToken(
    session.user.id,
    account.accountId,
  );
  if (!accessToken) {
    return NextResponse.json({
      connected: false,
      accountId: account.accountId,
      tools: [],
      message: "Connect this account with OAuth to list MCP tools.",
    });
  }

  try {
    const rawTools = await fetchMCPTools(
      session.user.id,
      accessToken,
      account.accountId,
    );
    const orgDisabled = await getOrgMcpDisabledToolNames({
      orgId: actor.orgId,
      accountId: account.accountId,
    });

    return NextResponse.json({
      connected: true,
      accountId: account.accountId,
      netsuiteMcpAccountId: account.id,
      tools: rawTools.map((tool) => {
        const label = fallbackMcpToolLabel(tool);
        const enabledByOrg = !orgDisabled.includes(tool.name);
        return {
          originalName: tool.name,
          displayName: label.displayName,
          description: label.description,
          enabledByOrg,
        };
      }),
    });
  } catch (error) {
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
