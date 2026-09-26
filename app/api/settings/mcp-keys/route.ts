import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getUserSettings } from "@/lib/db/queries";
import {
  getPublicAppOrigin,
  isPublicOriginConfigured,
} from "@/lib/http/public-origin";
import { authorizeAgentCreation } from "@/lib/mcp/server/agent-creation";
import { listAgentPersonaOptions } from "@/lib/mcp/server/agent-personas";
import { getMcpServerUrl } from "@/lib/mcp/server/config";
import { createMcpApiKey, listMcpApiKeys } from "@/lib/mcp/server/keys";
import { listOAuthGrants } from "@/lib/mcp/server/oauth/grants";
import { evaluateConnectPreflight } from "@/lib/mcp/server/oauth/preflight";
import { resolveMcpPolicyForUser } from "@/lib/mcp/server/policy";
import { resolveNetSuiteAccounts } from "@/lib/netsuite/accounts";
import { listConnectedNetSuiteAccountIds } from "@/lib/netsuite/tokens";
import { writeOrgAuditLog } from "@/lib/org/audit";

const createSchema = z.object({
  name: z.string().trim().min(1).max(128),
  netsuiteAccountId: z.string().trim().max(64).optional().nullable(),
  personaId: z.string().trim().max(128).optional().nullable(),
  expiresInDays: z.number().int().min(1).max(3650).optional().nullable(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const policy = await resolveMcpPolicyForUser(
    session.user.orgId,
    session.user.id,
  );
  const keys = await listMcpApiKeys(session.user.id);
  // Agents that signed in and agents that were handed a key are one list to
  // whoever owns them, so they are fetched together and rendered together.
  const grants = await listOAuthGrants(session.user.id);
  const personas = await listAgentPersonaOptions({
    id: session.user.id,
    orgId: session.user.orgId,
  });

  // Pinning an agent to one subsidiary is part of creating it, so the dialog
  // needs the list up front rather than fetching it when it opens.
  const [settings, connectedAccountIds] = await Promise.all([
    getUserSettings({ userId: session.user.id }),
    listConnectedNetSuiteAccountIds(session.user.id),
  ]);
  const accounts = resolveNetSuiteAccounts(settings ?? {}).map((entry) => ({
    accountId: entry.accountId,
    label: entry.label,
    connected: connectedAccountIds.includes(entry.accountId),
  }));

  return NextResponse.json({
    serverUrl: getMcpServerUrl(request),
    connect: {
      origin: getPublicAppOrigin(request),
      preflight: evaluateConnectPreflight({
        origin: getPublicAppOrigin(request),
        originIsConfigured: isPublicOriginConfigured(),
      }),
    },
    policy,
    keys,
    grants,
    accounts,
    personas: personas.map((persona) => ({
      id: persona.id,
      name: persona.name,
      primaryRole: persona.primaryRole,
      authoredBy: persona.authoredBy ?? "user",
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = createSchema.parse(await request.json());
    const requestedPersonaId = parsed.personaId?.trim() || null;

    const allowed = await authorizeAgentCreation({
      user: { id: session.user.id, orgId: session.user.orgId ?? null },
      personaId: requestedPersonaId,
    });
    if (!allowed.ok) {
      return NextResponse.json(
        { error: allowed.denial.error },
        { status: allowed.denial.status },
      );
    }

    const created = await createMcpApiKey({
      userId: session.user.id,
      orgId: session.user.orgId,
      name: parsed.name,
      netsuiteAccountId: parsed.netsuiteAccountId ?? null,
      personaId: requestedPersonaId,
      expiresAt: parsed.expiresInDays
        ? new Date(Date.now() + parsed.expiresInDays * 86_400_000)
        : null,
    });

    if (session.user.orgId) {
      await writeOrgAuditLog({
        orgId: session.user.orgId,
        actorUserId: session.user.id,
        action: "mcp_key.create",
        targetType: "McpApiKey",
        targetId: created.summary.id,
        metadata: { name: created.summary.name },
      });
    }

    return NextResponse.json({
      key: created.summary,
      // The only time the full key is ever returned.
      token: created.token,
      serverUrl: getMcpServerUrl(request),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 },
      );
    }
    console.error("[MCP Keys] Create failed:", error);
    return NextResponse.json(
      { error: "Failed to create the agent" },
      { status: 500 },
    );
  }
}
