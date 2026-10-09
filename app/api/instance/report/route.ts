import { NextResponse } from "next/server";
import { bearerToken } from "@/lib/instance-report/auth";
import { buildInstanceReport } from "@/lib/instance-report/report";
import { verifyReportToken } from "@/lib/instance-report/token";

export const dynamic = "force-dynamic";

/**
 * This instance's report, for whoever operates it. Off until an admin
 * generates a token (Admin → Instance report) or OSMCP_INSTANCE_REPORT_TOKEN
 * is set; then it answers a request bearing that token. See
 * docs/instance-report.md.
 */
export async function GET(request: Request) {
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
