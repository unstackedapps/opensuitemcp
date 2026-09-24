import { createHash } from "node:crypto";
import type { McpToolDefinition } from "./types";

const DIGEST_CHARS = 16;

/**
 * A stable fingerprint of one principal's tool surface.
 *
 * This server answers over plain request/response — there is no session and no
 * open stream — so it cannot push `notifications/tools/list_changed`, and it
 * says so by declaring `listChanged: false`. An agent that needs to notice a
 * tool appearing or disappearing has to ask. Comparing one short string is a
 * cheaper way to ask than diffing every entry, and the digest is returned by
 * both `tools/list` and osmcp_whoami so the asking can be the cheap call.
 *
 * The name, the input schema, and whether a tool is advertised as read-only
 * all feed it: a tool that quietly starts accepting different arguments, or
 * flips from read to write, is a change a watching agent must see.
 */
export function toolSurfaceDigest(tools: McpToolDefinition[]): string {
  const material = [...tools]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((tool) =>
      JSON.stringify({
        name: tool.name,
        inputSchema: tool.inputSchema,
        readOnlyHint: tool.annotations.readOnlyHint ?? null,
      }),
    )
    .join("\n");

  return createHash("sha256")
    .update(material)
    .digest("hex")
    .slice(0, DIGEST_CHARS);
}
