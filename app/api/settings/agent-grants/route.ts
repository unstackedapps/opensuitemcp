import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { authorizeAgentCreation } from "@/lib/mcp/server/agent-creation";
import { MCP_SCOPE } from "@/lib/mcp/server/config";
import { createManualOAuthClient } from "@/lib/mcp/server/oauth/clients";
import { createPendingOAuthGrant } from "@/lib/mcp/server/oauth/grants";
import { writeOrgAuditLog } from "@/lib/org/audit";

/**
 * Creating an agent that will connect by signing a client in.
 *
 * The sibling of minting a key, and deliberately the same shape: same dialog
 * behind it, same guards, same audit trail. The only difference is that there
 * is no secret to hand back — the agent waits in the portal until a client
 * completes the flow and binds itself to it.
 */

const createSchema = z.object({
  name: z.string().trim().min(1).max(128),
  netsuiteAccountId: z.string().trim().max(64).optional().nullable(),
  personaId: z.string().trim().max(128).optional().nullable(),
  description: z.string().trim().max(256).optional().nullable(),
  connectsFrom: z.string().trim().max(64).optional().nullable(),
  /** For a connector that demands an ID and secret rather than registering. */
  issueClientCredentials: z.boolean().optional(),
  /** Where that connector returns. Required when issuing credentials. */
  callbackUrl: z.string().trim().url().max(512).optional(),
});

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

    const grant = await createPendingOAuthGrant({
      userId: session.user.id,
      orgId: session.user.orgId ?? null,
      name: parsed.name,
      personaId: requestedPersonaId,
      netsuiteAccountId: parsed.netsuiteAccountId ?? null,
      description: parsed.description ?? null,
      connectsFrom: parsed.connectsFrom ?? null,
      scope: MCP_SCOPE,
    });

    // Issued from the agent app, bound to it, and shown once — the same
    // bargain its key makes. A connector that registers itself needs none of
    // this and never sees it.
    // A client with no registered callback is refused at the first
    // authorization with "that callback address is not registered", so the
    // callback is required rather than defaulted to nothing.
    if (parsed.issueClientCredentials && !parsed.callbackUrl) {
      return NextResponse.json(
        { error: "A callback URL is required for client credentials." },
        { status: 400 },
      );
    }

    const credentials = parsed.issueClientCredentials
      ? await createManualOAuthClient({
          userId: session.user.id,
          orgId: session.user.orgId ?? null,
          clientName: grant.name,
          redirectUris: [parsed.callbackUrl as string],
          grantId: grant.id,
        })
      : null;

    if (session.user.orgId) {
      await writeOrgAuditLog({
        orgId: session.user.orgId,
        actorUserId: session.user.id,
        action: "mcp_oauth.create",
        targetType: "OAuthGrant",
        targetId: grant.id,
        metadata: { name: grant.name, clientCredentials: Boolean(credentials) },
      });
    }

    return NextResponse.json({
      grant,
      clientId: credentials?.clientId ?? null,
      clientSecret: credentials?.clientSecret ?? null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 },
      );
    }
    console.error("[MCP OAuth] Agent create failed:", error);
    return NextResponse.json(
      { error: "Failed to create the agent" },
      { status: 500 },
    );
  }
}
