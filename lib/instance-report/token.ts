import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { instanceReportToken, user } from "@/lib/db/schema";
import { configuredReportToken, reportTokenMatches } from "./auth";

/**
 * Where the instance report's token comes from. OSMCP_INSTANCE_REPORT_TOKEN on
 * the server wins; otherwise an admin can generate one in the app, with no
 * restart. The app keeps only the generated token's SHA-256.
 */
export type ReportTokenState =
  | { source: "none" }
  | { source: "env" }
  | { source: "app"; createdAt: Date; createdByEmail: string | null };

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function getReportTokenState(): Promise<ReportTokenState> {
  if (configuredReportToken()) {
    return { source: "env" };
  }
  const [row] = await db
    .select({
      createdAt: instanceReportToken.createdAt,
      createdByEmail: user.email,
    })
    .from(instanceReportToken)
    .leftJoin(user, eq(user.id, instanceReportToken.createdBy))
    .limit(1);
  return row
    ? {
        source: "app",
        createdAt: row.createdAt,
        createdByEmail: row.createdByEmail ?? null,
      }
    : { source: "none" };
}

/**
 * "off" when no token is set, so the endpoints answer 404 as if absent;
 * "unauthorized" when the token presented does not match.
 */
export async function verifyReportToken(
  presented: string | null,
): Promise<"ok" | "unauthorized" | "off"> {
  const fromEnv = configuredReportToken();
  if (fromEnv) {
    return reportTokenMatches(presented, fromEnv) ? "ok" : "unauthorized";
  }
  const [row] = await db
    .select({ tokenHash: instanceReportToken.tokenHash })
    .from(instanceReportToken)
    .limit(1);
  if (!row) {
    return "off";
  }
  if (!presented) {
    return "unauthorized";
  }
  const a = Buffer.from(sha256(presented));
  const b = Buffer.from(row.tokenHash);
  return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "unauthorized";
}

/** Make a new token, replacing any earlier one. Returns it; it isn't kept. */
export async function generateReportToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const values = {
    id: 1,
    tokenHash: sha256(token),
    createdAt: new Date(),
    createdBy: userId,
  };
  await db
    .insert(instanceReportToken)
    .values(values)
    .onConflictDoUpdate({ target: instanceReportToken.id, set: values });
  return token;
}

export async function deleteReportToken(): Promise<void> {
  await db.delete(instanceReportToken);
}
