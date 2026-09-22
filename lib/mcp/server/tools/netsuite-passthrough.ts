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
import { normalizeCallResult } from "./netsuite-result";
import { netsuiteToolIsReadOnly } from "./netsuite-write-classifier";
import {
  type JsonSchemaObject,
  type McpToolDefinition,
  toolError,
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
