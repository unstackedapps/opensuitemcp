import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  readClientCredentialsForGrant,
  rotateClientSecretForGrant,
  setClientCallbacksForGrant,
} from "@/lib/mcp/server/oauth/clients";
import { writeOrgAuditLog } from "@/lib/org/audit";

/**
 * The client ID and secret an agent app issued for itself.
 *
 * GET reads them back, POST replaces the secret in place. Both exist for the
 * same reason the bearer token has copy and replace: needing fresh credentials
 * should not mean deleting the app and rebuilding its name, persona, pinned
 * account and history.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ grantId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { grantId } = await params;
  const credentials = await readClientCredentialsForGrant({
    userId: session.user.id,
    grantId,
  });
  if (!credentials) {
    return NextResponse.json(
      { error: "This agent app has no client credentials." },
      { status: 404 },
    );
  }
  return NextResponse.json(credentials);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ grantId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { grantId } = await params;
  const rotated = await rotateClientSecretForGrant({
    userId: session.user.id,
    grantId,
  });
  if (!rotated) {
    return NextResponse.json(
      { error: "This agent app has no client credentials." },
      { status: 404 },
    );
  }

  if (session.user.orgId) {
    await writeOrgAuditLog({
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "mcp_oauth.rotate_secret",
      targetType: "OAuthGrant",
      targetId: grantId,
    });
  }

  return NextResponse.json(rotated);
}

const patchSchema = z.object({
  redirectUris: z.array(z.string().trim().url().max(512)).min(1).max(5),
});

/** Correct the callback URL without reissuing the client id or secret. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ grantId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { grantId } = await params;
  try {
    const parsed = patchSchema.parse(await request.json());
    const updated = await setClientCallbacksForGrant({
      userId: session.user.id,
      grantId,
      redirectUris: parsed.redirectUris,
    });
    if (!updated) {
      return NextResponse.json(
        { error: "This agent app has no client credentials." },
        { status: 404 },
      );
    }
    return NextResponse.json({ redirectUris: parsed.redirectUris });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Give a valid https callback URL." },
        { status: 400 },
      );
    }
    throw error;
  }
}
