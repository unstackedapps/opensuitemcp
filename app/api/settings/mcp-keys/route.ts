import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getMcpServerUrl, isMcpServerEnabled } from "@/lib/mcp/server/config";
import {
  countActiveMcpApiKeys,
  createMcpApiKey,
  listMcpApiKeys,
} from "@/lib/mcp/server/keys";
import { resolveMcpPolicy } from "@/lib/mcp/server/policy";
import { writeOrgAuditLog } from "@/lib/org/audit";

const createSchema = z.object({
  name: z.string().trim().min(1).max(128),
  netsuiteAccountId: z.string().trim().max(64).optional().nullable(),
  expiresInDays: z.number().int().min(1).max(3650).optional().nullable(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const policy = await resolveMcpPolicy(session.user.orgId);
  const keys = await listMcpApiKeys(session.user.id);

  return NextResponse.json({
    serverEnabled: isMcpServerEnabled(),
    serverUrl: getMcpServerUrl(request),
    policy,
    keys,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isMcpServerEnabled()) {
    return NextResponse.json(
      {
        error:
          "The MCP server is not enabled on this install. Set OSMCP_MCP_SERVER_ENABLED=true and restart.",
      },
      { status: 409 },
    );
  }

  const policy = await resolveMcpPolicy(session.user.orgId);
  if (!policy.enabled) {
    return NextResponse.json(
      {
        error:
          "MCP server access is disabled for this organization. Ask an administrator to enable it.",
      },
      { status: 403 },
    );
  }

  try {
    const parsed = createSchema.parse(await request.json());

    const activeCount = await countActiveMcpApiKeys(session.user.id);
    if (activeCount >= policy.maxKeysPerUser) {
      return NextResponse.json(
        {
          error: `You already have ${activeCount} active keys. Revoke one before creating another.`,
        },
        { status: 409 },
      );
    }

    // Scopes are narrowed rather than rejected so a policy change does not turn
    // a reasonable request into an error the caller cannot act on.

    const created = await createMcpApiKey({
      userId: session.user.id,
      orgId: session.user.orgId,
      name: parsed.name,
      netsuiteAccountId: parsed.netsuiteAccountId ?? null,
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
      { error: "Failed to create the API key" },
      { status: 500 },
    );
  }
}
