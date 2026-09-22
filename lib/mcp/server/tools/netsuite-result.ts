import { type McpToolResult, toolResult } from "./types";

/**
 * Some NetSuite CustomTool responses stringify their arrays and objects.
 * Re-parsing them lets a caller read rows as data instead of as a JSON string.
 */
export function coerceStructured(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const structured: Record<string, unknown> = { ...record };
  for (const key of Object.keys(structured)) {
    const value = structured[key];
    if (
      typeof value === "string" &&
      (value.startsWith("[") || value.startsWith("{"))
    ) {
      try {
        structured[key] = JSON.parse(value);
      } catch {
        // Leave the original string when it only looks like JSON.
      }
    }
  }
  return structured;
}

/**
 * NetSuite answers a tool call with a spec CallToolResult whose payload is a
 * JSON document stringified into the text part, and sends no structuredContent
 * of its own. Parsing that text out is what makes `structuredContent` the rows
 * and columns the server instructions tell an agent to prefer; without it the
 * field is a copy of the envelope and the real data is still a string.
 */
function structuredFromText(
  parts: { text: string }[],
): Record<string, unknown> | null {
  const documents: unknown[] = [];

  for (const part of parts) {
    const trimmed = part.text.trim();
    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
      continue;
    }
    try {
      documents.push(JSON.parse(trimmed));
    } catch {
      // Not JSON after all; the text part stands on its own.
    }
  }

  if (documents.length === 0) {
    return null;
  }
  if (documents.length > 1) {
    return { results: documents };
  }

  const only = documents[0];
  if (Array.isArray(only)) {
    return { data: only };
  }
  if (only && typeof only === "object") {
    return coerceStructured(only as Record<string, unknown>);
  }
  return { value: only };
}

/**
 * NetSuite reports two different kinds of failure. A malformed request comes
 * back as a CallToolResult with `isError`, but a refusal from NetSuite itself —
 * a permission violation, a missing required field — comes back as an ordinary
 * successful result whose payload carries `success: false` and an `error`.
 *
 * MCP clients branch on `isError` alone, so without this an agent reads
 * "Permission Violation" as a record it just created.
 */
function payloadReportsFailure(payload: Record<string, unknown>): boolean {
  if (payload.success === false) {
    return true;
  }
  if (payload.success === true) {
    return false;
  }
  return typeof payload.error === "string" && payload.error.trim().length > 0;
}

/**
 * NetSuite returns either a spec-shaped CallToolResult or a bare object.
 * Both are normalized so a caller always gets readable text and a structured
 * body, without discarding anything NetSuite sent.
 */
export function normalizeCallResult(result: unknown): McpToolResult {
  if (result && typeof result === "object" && "content" in result) {
    const record = result as Record<string, unknown>;
    const content = Array.isArray(record.content)
      ? (record.content as { type: string; text?: string }[])
          .filter(
            (part) => part?.type === "text" && typeof part.text === "string",
          )
          .map((part) => ({ type: "text" as const, text: part.text as string }))
      : [];

    let structured: Record<string, unknown>;
    if (
      record.structuredContent &&
      typeof record.structuredContent === "object"
    ) {
      structured = record.structuredContent as Record<string, unknown>;
    } else {
      structured = structuredFromText(content) ?? coerceStructured(record);
    }

    return {
      content:
        content.length > 0
          ? content
          : [{ type: "text" as const, text: JSON.stringify(record) }],
      structuredContent: structured,
      isError: record.isError === true || payloadReportsFailure(structured),
    };
  }

  if (result && typeof result === "object") {
    const structured = coerceStructured(result as Record<string, unknown>);
    return {
      ...toolResult(structured),
      isError: payloadReportsFailure(structured),
    };
  }

  return toolResult({ value: result ?? null }, String(result ?? ""));
}
