import "server-only";

import { getUserSettings } from "@/lib/db/queries";
import { resolveNetSuiteAccounts } from "@/lib/netsuite/accounts";
import {
  executeMCPTool,
  fetchMCPTools,
  type MCPTool,
} from "@/lib/netsuite/mcp";
import {
  isMcpToolAllowed,
  MCP_TOOL_DISABLED_MESSAGE,
} from "@/lib/netsuite/mcp-tool-settings";
import { getNetSuiteToken } from "@/lib/netsuite/tokens";
import { resolveEffectiveNetsuiteMcpToolSettings } from "@/lib/org/mcp-tool-policy";
import type { McpPrincipal } from "../authenticate";
import { netsuiteToolIsReadOnly } from "./netsuite-write-classifier";
import {
  type JsonSchemaObject,
  type McpToolDefinition,
  toolError,
  toolResult,
} from "./types";
import { resolveAccountForPrincipal } from "./workspace";

/**
 * NetSuite's own MCP tools, re-exposed on this server under the identity of
 * the API key's owner.
 *
 * Input schemas are forwarded exactly as NetSuite published them. Round-
 * tripping them through Zod — as the chat path does, because the AI SDK
 * requires it — discards enums, formats, and nested object shapes that a
 * calling agent needs to construct a valid request.
 */
export async function loadNetSuitePassthroughTools(
  principal: McpPrincipal,
): Promise<McpToolDefinition[]> {
  const settings = await getUserSettings({ userId: principal.userId });
  const accounts = resolveNetSuiteAccounts(settings ?? {});
  const accountId = resolveAccountForPrincipal({
    pinnedAccountId: principal.pinnedNetSuiteAccountId,
    settingsAccountId: settings?.netsuiteAccountId,
    fallbackAccountId: accounts[0]?.accountId,
  });

  if (!accountId) {
    return [];
  }

  const accessToken = await getNetSuiteToken(principal.userId, accountId);
  if (!accessToken) {
    return [];
  }

  let netsuiteTools: MCPTool[];
  try {
    netsuiteTools = await fetchMCPTools(
      principal.userId,
      accessToken,
      accountId,
    );
  } catch (error) {
    // A discovery failure must not blank the whole tool list — the workspace
    // tools still work, and osmcp_connection_status explains the problem.
    console.error(
      "[MCP Server] Failed to list NetSuite tools:",
      error instanceof Error ? error.message : String(error),
    );
    return [];
  }

  if (!Array.isArray(netsuiteTools)) {
    return [];
  }

  const toolPolicy = await resolveEffectiveNetsuiteMcpToolSettings({
    orgId: principal.orgId,
    accountId,
    userSettings: settings?.netsuiteMcpTools,
  });

  const definitions: McpToolDefinition[] = [];
  for (const netsuiteTool of netsuiteTools) {
    if (!isMcpToolAllowed(toolPolicy, accountId, netsuiteTool.name)) {
      continue;
    }
    definitions.push(toDefinition(netsuiteTool, accountId));
  }

  return definitions;
}

function toDefinition(
  netsuiteTool: MCPTool,
  accountId: string,
): McpToolDefinition {
  const readOnly = netsuiteToolIsReadOnly(netsuiteTool.name);

  return {
    name: netsuiteTool.name,
    title: netsuiteTool.annotations?.title ?? netsuiteTool.name,
    description: netsuiteTool.description,
    inputSchema: normalizeInputSchema(netsuiteTool.inputSchema),
    annotations: {
      title: netsuiteTool.annotations?.title ?? netsuiteTool.name,
      readOnlyHint: readOnly,
      // Mutating NetSuite tools keep the spec's conservative default so a
      // client that gates on destructiveHint prompts before running them.
      destructiveHint: !readOnly,
      idempotentHint: readOnly,
      openWorldHint: true,
    },
    execute: async (args, principal) => {
      const accessToken = await getNetSuiteToken(principal.userId, accountId);
      if (!accessToken) {
        return toolError(
          "The NetSuite authorization for this account is no longer valid. A person must reconnect the account in OpenSuiteMCP under Settings -> NetSuite; retrying will not help.",
        );
      }

      // Policy is re-read per call, not trusted from list time, so a tool
      // disabled by an admin mid-session stops working immediately.
      const settings = await getUserSettings({ userId: principal.userId });
      const toolPolicy = await resolveEffectiveNetsuiteMcpToolSettings({
        orgId: principal.orgId,
        accountId,
        userSettings: settings?.netsuiteMcpTools,
      });
      if (!isMcpToolAllowed(toolPolicy, accountId, netsuiteTool.name)) {
        return toolError(MCP_TOOL_DISABLED_MESSAGE);
      }

      try {
        const result = await executeMCPTool({
          userId: principal.userId,
          accessToken,
          toolName: netsuiteTool.name,
          toolParams: args,
          accountId,
        });
        return normalizeCallResult(result);
      } catch (error) {
        return toolError(
          error instanceof Error ? error.message : "NetSuite tool call failed.",
        );
      }
    },
  };
}

/** NetSuite occasionally omits `properties`; clients expect a usable object. */
function normalizeInputSchema(
  schema: MCPTool["inputSchema"],
): JsonSchemaObject {
  if (!schema || typeof schema !== "object") {
    return { type: "object", properties: {} };
  }
  return {
    ...schema,
    type: "object",
    properties: schema.properties ?? {},
  };
}

/**
 * NetSuite returns either a spec-shaped CallToolResult or a bare object.
 * Both are normalized so a caller always gets readable text and a structured
 * body, without discarding anything NetSuite sent.
 */
function normalizeCallResult(result: unknown) {
  if (result && typeof result === "object" && "content" in result) {
    const record = result as Record<string, unknown>;
    const content = Array.isArray(record.content)
      ? (record.content as { type: string; text?: string }[])
          .filter(
            (part) => part?.type === "text" && typeof part.text === "string",
          )
          .map((part) => ({ type: "text" as const, text: part.text as string }))
      : [];

    const structured =
      record.structuredContent && typeof record.structuredContent === "object"
        ? (record.structuredContent as Record<string, unknown>)
        : coerceStructured(record);

    return {
      content:
        content.length > 0
          ? content
          : [{ type: "text" as const, text: JSON.stringify(record) }],
      structuredContent: structured,
      isError: record.isError === true,
    };
  }

  if (result && typeof result === "object") {
    return toolResult(coerceStructured(result as Record<string, unknown>));
  }

  return toolResult({ value: result ?? null }, String(result ?? ""));
}

/**
 * Some NetSuite CustomTool responses stringify their arrays and objects.
 * Re-parsing them lets a caller read rows as data instead of as a JSON string.
 */
function coerceStructured(
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
