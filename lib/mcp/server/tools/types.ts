import type { McpPrincipal } from "../authenticate";

/**
 * JSON Schema is kept as a plain object rather than a Zod schema so NetSuite's
 * own tool schemas can be forwarded verbatim. Converting them to Zod and back
 * loses enums, formats, and nested shapes the calling agent needs.
 */
export type JsonSchemaObject = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
};

export type McpTextContent = { type: "text"; text: string };

export type McpToolResult = {
  content: McpTextContent[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export type McpToolAnnotations = {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

/**
 * What a tool may know about the call around it.
 *
 * `toolSurface` is how osmcp_whoami reports the digest of the whole surface
 * without importing the builder that assembles it — the builder already has
 * every tool, this one included, and a tool reaching back for it would close
 * that loop. The dispatcher owns both, so it hands the answer down.
 */
export type McpToolContext = {
  toolSurface: () => Promise<McpToolDefinition[]>;
};

export type McpToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchemaObject;
  annotations: McpToolAnnotations;
  execute: (
    args: Record<string, unknown>,
    principal: McpPrincipal,
    context: McpToolContext,
  ) => Promise<McpToolResult>;
};

export const EMPTY_INPUT_SCHEMA: JsonSchemaObject = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

/**
 * Build a result carrying both a readable rendering and the raw object.
 *
 * Both halves are always populated: agents that only read `content` still get
 * the data, and agents that render tables read `structuredContent` without
 * re-parsing prose.
 */
export function toolResult(
  structured: Record<string, unknown>,
  text?: string,
): McpToolResult {
  return {
    content: [
      { type: "text", text: text ?? JSON.stringify(structured, null, 2) },
    ],
    structuredContent: structured,
  };
}

/**
 * Tool-level failures are reported as results, not JSON-RPC errors, so the
 * calling model can read the reason and choose another path.
 */
export function toolError(message: string): McpToolResult {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: { error: message },
    isError: true,
  };
}
