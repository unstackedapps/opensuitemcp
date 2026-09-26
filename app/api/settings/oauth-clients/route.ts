import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  createManualOAuthClient,
  listManualOAuthClients,
} from "@/lib/mcp/server/oauth/clients";
import { isAllowedRedirectUriShape } from "@/lib/mcp/server/oauth/redirect-uri";
import { resolveMcpPolicyForUser } from "@/lib/mcp/server/policy";
import { writeOrgAuditLog } from "@/lib/org/audit";

/**
 * OAuth clients a person creates by hand.
 *
 * Most connectors register themselves, or publish a metadata document, and
 * never come near this. It exists for the ones that ask for a client id and
 * secret up front — Claude's advanced settings among them — where somebody has
 * to create the client on this side first and paste the two values across.
 */

const createSchema = z.object({
  clientName: z.string().trim().min(1).max(128),
  redirectUris: z.array(z.string().trim().min(1).max(2048)).min(1).max(10),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    clients: await listManualOAuthClients(session.user.id),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const policy = await resolveMcpPolicyForUser(
    session.user.orgId,
    session.user.id,
  );
  if (!(policy.enabled && policy.memberAllowed)) {
    return NextResponse.json(
      {
        error:
          "Agent access is not available to this account. Ask an administrator.",
      },
      { status: 403 },
    );
  }

  try {
    const parsed = createSchema.parse(await request.json());

    const bad = parsed.redirectUris.find(
      (uri) => !isAllowedRedirectUriShape(uri),
    );
    if (bad) {
      return NextResponse.json(
        {
          error: `${bad} cannot be used. A callback must be https, or http on a loopback address, and must not include a #fragment.`,
        },
        { status: 400 },
      );
    }

    const created = await createManualOAuthClient({
      userId: session.user.id,
      orgId: session.user.orgId,
      clientName: parsed.clientName,
      redirectUris: parsed.redirectUris,
    });

    if (session.user.orgId) {
      await writeOrgAuditLog({
        orgId: session.user.orgId,
        actorUserId: session.user.id,
        action: "mcp_oauth.client_create",
        targetType: "OAuthClient",
        targetId: created.summary.id,
        metadata: { clientName: created.summary.clientName },
      });
    }

    return NextResponse.json(
      {
        client: created.summary,
        // The only time the secret is returned alongside creation.
        clientId: created.clientId,
        clientSecret: created.clientSecret,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 },
      );
    }
    console.error("[MCP OAuth] Client create failed:", error);
    return NextResponse.json(
      { error: "Failed to create the OAuth client" },
      { status: 500 },
    );
  }
}
