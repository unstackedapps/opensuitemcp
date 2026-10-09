import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { isOrgInstallMode } from "@/lib/org/install-config";
import { canManageUpdates } from "@/lib/updates/access";
import {
  getUpdateStatus,
  requestUpdate,
  setUpdatePolicy,
  UpdateRequestError,
} from "@/lib/updates/control";

export const dynamic = "force-dynamic";

/** App updates: Admin → App updates on an org install, Settings → General on solo. */

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update") }),
  z.object({
    action: z.literal("policy"),
    autoUpdate: z.boolean().optional(),
    allowRemote: z.boolean().optional(),
  }),
]);

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET() {
  if (!canManageUpdates(await auth())) {
    return forbidden();
  }
  return NextResponse.json(await getUpdateStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!canManageUpdates(await auth())) {
    return forbidden();
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    if (parsed.data.action === "update") {
      const version = await requestUpdate({
        requestedBy: isOrgInstallMode() ? "admin" : "settings",
      });
      return NextResponse.json({ version }, { status: 202 });
    }
    const { autoUpdate, allowRemote } = parsed.data;
    const policy = await setUpdatePolicy({ autoUpdate, allowRemote });
    return NextResponse.json({ policy });
  } catch (error) {
    if (error instanceof UpdateRequestError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[updates]", error);
    return NextResponse.json(
      { error: "Couldn't reach the updater." },
      { status: 500 },
    );
  }
}
