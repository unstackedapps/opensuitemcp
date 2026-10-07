import { NextResponse } from "next/server";
import {
  bearerToken,
  configuredReportToken,
  reportTokenMatches,
} from "@/lib/instance-report/auth";
import { buildInstanceReport } from "@/lib/instance-report/report";

export const dynamic = "force-dynamic";

/**
 * This instance's report, for whoever operates it. Off unless
 * OSMCP_INSTANCE_REPORT_TOKEN is set; then it answers a request bearing that
 * token. See docs/instance-report.md.
 */
export async function GET(request: Request) {
  const expected = configuredReportToken();
  if (!expected) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const presented = bearerToken(request.headers.get("authorization"));
  if (!reportTokenMatches(presented, expected)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: { "WWW-Authenticate": 'Bearer realm="instance-report"' },
      },
    );
  }

  try {
    const report = await buildInstanceReport();
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[instance-report]", error);
    return NextResponse.json(
      { error: "Could not build the report." },
      { status: 500 },
    );
  }
}
