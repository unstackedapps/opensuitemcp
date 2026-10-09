import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { mcpToolCallHourly } from "@/lib/db/schema";
import type { McpPrincipal } from "./authenticate";
import type { McpToolResult } from "./tools/types";

/** A call failed when its tool returned an error result, or no result at all. */
export function toolCallFailed(result: McpToolResult | null): boolean {
  return result === null || result.isError === true;
}

/**
 * Add one call to this hour's total for the agent app and tool. Fire-and-forget
 * like the last-used stamp: a failure here must never fail the tool call the
 * agent asked for.
 */
export async function recordMcpToolCall(
  principal: McpPrincipal,
  tool: string,
  failed: boolean,
): Promise<void> {
  const errors = failed ? 1 : 0;
  try {
    await db
      .insert(mcpToolCallHourly)
      .values({
        hour: sql`date_trunc('hour', now() AT TIME ZONE 'UTC')`,
        userId: principal.userId,
        credentialKind: principal.credentialKind,
        credentialId: principal.keyId,
        tool: tool.slice(0, 128),
        calls: 1,
        errors,
      })
      .onConflictDoUpdate({
        target: [
          mcpToolCallHourly.hour,
          mcpToolCallHourly.userId,
          mcpToolCallHourly.credentialKind,
          mcpToolCallHourly.credentialId,
          mcpToolCallHourly.tool,
        ],
        set: {
          calls: sql`${mcpToolCallHourly.calls} + 1`,
          errors: sql`${mcpToolCallHourly.errors} + ${errors}`,
        },
      });
  } catch (error) {
    console.warn(
      "[MCP Server] Failed to record tool call:",
      error instanceof Error ? error.message : String(error),
    );
  }
}
