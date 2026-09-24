import "server-only";

import { getUserSettings } from "@/lib/db/queries";
import { resolveNetSuiteAccounts } from "@/lib/netsuite/accounts";
import { executeMCPTool } from "@/lib/netsuite/mcp";
import {
  isMcpToolAllowed,
  MCP_TOOL_DISABLED_MESSAGE,
} from "@/lib/netsuite/mcp-tool-settings";
import {
  fillPrompt,
  filterPrompts,
  type NetSuitePrompt,
  NS_PROMPT_LIBRARY_TOOL,
  parsePromptLibraryResult,
  promptPlaceholders,
} from "@/lib/netsuite/prompt-library";
import { getNetSuiteToken } from "@/lib/netsuite/tokens";
import { resolveEffectiveNetsuiteMcpToolSettings } from "@/lib/org/mcp-tool-policy";
import type { McpPrincipal } from "../authenticate";
import {
  type McpToolDefinition,
  type McpToolResult,
  toolError,
  toolResult,
} from "./types";
import { resolveAccountForPrincipal } from "./workspace";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const PLACEHOLDER_NOTE =
  "A value in square brackets is a blank the prompt expects you to fill, not text to use as written. Resolve every one before acting on the prompt, and never pass a bracketed token into a query.";

type LibraryOutcome =
  | { ok: true; prompts: NetSuitePrompt[] }
  | { ok: false; result: McpToolResult };

/**
 * Load this user's Companion prompt library.
 *
 * Reached through NetSuite's own tool, so the library is whatever the account
 * currently publishes and the per-user toggle for that tool gates an agent the
 * same way it gates the app.
 */
async function loadPromptLibrary(
  principal: McpPrincipal,
): Promise<LibraryOutcome> {
  const settings = await getUserSettings({ userId: principal.userId });
  const accounts = resolveNetSuiteAccounts(settings ?? {});
  const accountId = resolveAccountForPrincipal({
    pinnedAccountId: principal.pinnedNetSuiteAccountId,
    settingsAccountId: settings?.netsuiteAccountId,
    fallbackAccountId: accounts[0]?.accountId,
  });
  if (!accountId) {
    return {
      ok: false,
      result: toolError(
        "No NetSuite account is connected for this user, so there is no prompt library to read. Call osmcp_connection_status.",
      ),
    };
  }

  const accessToken = await getNetSuiteToken(principal.userId, accountId);
  if (!accessToken) {
    return {
      ok: false,
      result: toolError(
        "The NetSuite authorization for this account is no longer valid. A person must reconnect it in OpenSuiteMCP under Settings -> NetSuite; retrying will not help.",
      ),
    };
  }

  const toolPolicy = await resolveEffectiveNetsuiteMcpToolSettings({
    orgId: principal.orgId,
    accountId,
    userSettings: settings?.netsuiteMcpTools,
  });
  if (!isMcpToolAllowed(toolPolicy, accountId, NS_PROMPT_LIBRARY_TOOL)) {
    return { ok: false, result: toolError(MCP_TOOL_DISABLED_MESSAGE) };
  }

  let raw: unknown;
  try {
    raw = await executeMCPTool({
      userId: principal.userId,
      accessToken,
      toolName: NS_PROMPT_LIBRARY_TOOL,
      toolParams: {},
      accountId,
    });
  } catch (error) {
    return {
      ok: false,
      result: toolError(
        error instanceof Error
          ? error.message
          : "The NetSuite prompt library could not be read.",
      ),
    };
  }

  const payload = parsePromptLibraryResult(raw);
  if (payload.prompts.length === 0) {
    return {
      ok: false,
      result: toolError(
        payload.error ?? "NetSuite returned no prompts for this account.",
      ),
    };
  }
  return { ok: true, prompts: payload.prompts };
}

function readString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

const listPrompts: McpToolDefinition = {
  name: "osmcp_list_prompts",
  title: "List NetSuite prompts",
  description:
    "List the NetSuite Companion prompt library available to this workspace — task-shaped prompts written for NetSuite work, each tagged by category, role and industry. Use it to find an established way to approach a request before composing your own. Each entry reports the blanks that prompt expects you to fill; read the full text with osmcp_get_prompt.",
  inputSchema: {
    type: "object",
    properties: {
      search: {
        type: "string",
        description: "Match against name, category, and prompt text.",
      },
      category: { type: "string", description: "Match a category." },
      role: { type: "string", description: "Match a role the prompt targets." },
      industry: {
        type: "string",
        description: "Match an industry the prompt targets.",
      },
    },
    additionalProperties: false,
  },
  annotations: { title: "List NetSuite prompts", ...READ_ONLY },
  execute: async (args, principal) => {
    const outcome = await loadPromptLibrary(principal);
    if (!outcome.ok) {
      return outcome.result;
    }

    const matches = filterPrompts(outcome.prompts, {
      search: readString(args, "search"),
      category: readString(args, "category"),
      role: readString(args, "role"),
      industry: readString(args, "industry"),
    });

    const rows = matches.map((prompt) => ({
      id: prompt.id,
      name: prompt.name,
      category: prompt.category,
      roles: prompt.roles,
      industries: prompt.industries,
      placeholders: promptPlaceholders(prompt.prompt).map(
        (placeholder) => placeholder.label,
      ),
    }));

    return toolResult({
      columns: [
        "id",
        "name",
        "category",
        "roles",
        "industries",
        "placeholders",
      ],
      rows,
      total: outcome.prompts.length,
      matched: rows.length,
    });
  },
};

const getPrompt: McpToolDefinition = {
  name: "osmcp_get_prompt",
  title: "Get NetSuite prompt",
  description: `Read one prompt from osmcp_list_prompts, optionally filling its blanks. Pass \`values\` keyed by the placeholder ids this tool reports to substitute them. The result carries the filled \`text\`, the original \`template\`, and \`unfilled\` — the blanks still open. ${PLACEHOLDER_NOTE}`,
  inputSchema: {
    type: "object",
    properties: {
      promptId: {
        type: "string",
        description: "The `id` from osmcp_list_prompts.",
      },
      values: {
        type: "object",
        description:
          'Placeholder values keyed by placeholder id, e.g. {"[period]#0": "Q3 2026", "[period]#1": "Q2 2026"}. A repeated token takes one entry per occurrence.',
        additionalProperties: { type: "string" },
      },
    },
    required: ["promptId"],
    additionalProperties: false,
  },
  annotations: { title: "Get NetSuite prompt", ...READ_ONLY },
  execute: async (args, principal) => {
    const promptId = readString(args, "promptId");
    if (!promptId) {
      return toolError(
        "Pass the `promptId` of a prompt from osmcp_list_prompts.",
      );
    }

    const outcome = await loadPromptLibrary(principal);
    if (!outcome.ok) {
      return outcome.result;
    }

    const prompt = outcome.prompts.find((entry) => entry.id === promptId);
    if (!prompt) {
      return toolError(
        `No prompt \`${promptId}\` is in this account's library. Call osmcp_list_prompts for the ids that are.`,
      );
    }

    const rawValues = args.values;
    const values: Record<string, string> = {};
    if (
      rawValues &&
      typeof rawValues === "object" &&
      !Array.isArray(rawValues)
    ) {
      for (const [key, value] of Object.entries(
        rawValues as Record<string, unknown>,
      )) {
        if (typeof value === "string") {
          values[key] = value;
        }
      }
    }

    const filled = fillPrompt(prompt.prompt, values);
    const placeholders = promptPlaceholders(prompt.prompt);

    return toolResult(
      {
        id: prompt.id,
        name: prompt.name,
        category: prompt.category,
        roles: prompt.roles,
        industries: prompt.industries,
        text: filled.text,
        template: filled.template,
        placeholders,
        unfilled: filled.unfilled,
      },
      filled.unfilled.length > 0
        ? `${filled.text}\n\n---\nStill to fill: ${filled.unfilled
            .map((entry) => `${entry.id} (${entry.label})`)
            .join(", ")}. ${PLACEHOLDER_NOTE}`
        : filled.text,
    );
  },
};

export const promptTools: McpToolDefinition[] = [listPrompts, getPrompt];
