import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getUserSettings } from "@/lib/db/queries";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";
import { readMCPResource } from "@/lib/netsuite/mcp";
import { getNetSuiteToken } from "@/lib/netsuite/tokens";

const bodySchema = z.object({
  uri: z.string().min(1).max(2048),
});

/**
 * POST /api/netsuite/mcp-resource
 * Reads an MCP resource (e.g. MCP App HTML) from the NetSuite AI Connector
 * for the user's selected (active) account.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getUserSettings({ userId: session.user.id });
  const accountId = settings?.netsuiteAccountId
    ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
    : null;
  const accessToken = accountId
    ? await getNetSuiteToken(session.user.id, accountId)
    : null;
  if (!(accountId && accessToken)) {
    return NextResponse.json(
      { error: "NetSuite not connected" },
      { status: 400 },
    );
  }

  try {
    const parsed = bodySchema.parse(await request.json());
    const resource = await readMCPResource({
      userId: session.user.id,
      accessToken,
      uri: parsed.uri,
      accountId,
    });

    const content = resource.contents[0];
    let html: string | null = null;
    if (typeof content.text === "string") {
      html = content.text;
    } else if (typeof content.blob === "string") {
      html = Buffer.from(content.blob, "base64").toString("utf8");
    }

    if (!html) {
      return NextResponse.json(
        { error: "Resource has no HTML content" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      uri: content.uri,
      mimeType: content.mimeType ?? null,
      html,
      meta: content._meta ?? null,
    });
  } catch (error) {
    console.error("[MCP Resource API] Error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to read resource",
      },
      { status: 500 },
    );
  }
}
