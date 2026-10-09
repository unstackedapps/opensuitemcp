import { NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken } from "@/lib/instance-report/auth";
import { verifyReportToken } from "@/lib/instance-report/token";
import {
  readUpdatePolicy,
  requestUpdate,
  UpdateRequestError,
} from "@/lib/updates/control";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ version: z.string().min(1).max(64).optional() })
  .nullable();

/**
 * Lets whoever operates this instance start an update, with the instance
 * report token. Off unless the token is set and an admin has turned on
 * "Updates from your operator". See docs/instance-report.md.
 */
export async function POST(request: Request) {
  const verdict = await verifyReportToken(
    bearerToken(request.headers.get("authorization")),
  );
  if (verdict === "off") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (verdict === "unauthorized") {
    return NextResponse.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: { "WWW-Authenticate": 'Bearer realm="instance-report"' },
      },
    );
  }

  if (!(await readUpdatePolicy()).allowRemote) {
    return NextResponse.json(
      {
        error:
          "This install doesn't accept updates from its operator. An admin turns them on under App updates.",
      },
      { status: 403 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    const version = await requestUpdate({
      version: parsed.data?.version,
      requestedBy: "operator",
    });
    return NextResponse.json({ version }, { status: 202 });
  } catch (error) {
    if (error instanceof UpdateRequestError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[instance-update]", error);
    return NextResponse.json(
      { error: "Couldn't reach the updater." },
      { status: 500 },
    );
  }
}
