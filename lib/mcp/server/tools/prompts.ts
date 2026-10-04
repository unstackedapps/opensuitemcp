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
  BUILTIN_BRIEFINGS,
  NETSUITE_PROMPT_PREFIX,
  publishedPromptNames,
  resolvePromptMessages,
} from "../prompt-surface";
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

/**
 * The briefings, for a client that cannot render MCP prompts.
 *
 * A briefing is what this server tells a connecting agent to do before it
 * touches NetSuite: confirm the identity, adopt the persona, read its skills,
 * open a thread, save what was established. MCP publishes them through
 * `prompts/list` and `prompts/get`, which most clients ignore, so without this
 * tool nothing reaches them and an agent does none of it — nothing in a tool
 * name says to.
 *
 * Distinct from the NetSuite Companion prompts in osmcp_list_prompts, which are
 * text a person drops into their own chat.
 */
const runBriefing: McpToolDefinition = {
  name: "osmcp_run_briefing",
  title: "Run a briefing",
  description:
    "Fetch a briefing — this server's own instructions for how to work in it — and follow what it returns. The four are `osmcp_start_task` (confirm identity, adopt the persona, read its skills, open a thread, then work), `osmcp_choose_persona` (pick the specialist before starting), `osmcp_record_session` (write this session into a thread) and `osmcp_capture_skill` (turn what was established into a skill). Call `osmcp_start_task` before any NetSuite work. A `netsuite_*` name from this account's Companion prompt library also resolves here; osmcp_list_prompts browses that library by category, role and industry.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description:
          "A briefing name, or a `netsuite_*` name this server publishes.",
      },
      arguments: {
        type: "object",
        description:
          'Values for the briefing\'s arguments, keyed by argument name, e.g. {"task": "Reconcile August bank statements"}.',
        additionalProperties: { type: "string" },
      },
    },
    required: ["name"],
    additionalProperties: false,
  },
  annotations: { title: "Run a briefing", ...READ_ONLY },
  execute: async (args, principal) => {
    const name = readString(args, "name");
    if (!name) {
      return toolError(
        `Pass a \`name\`. The briefings are ${BUILTIN_BRIEFINGS.map(
          (briefing) => `\`${briefing.name}\``,
        ).join(", ")}.`,
      );
    }

    const rawArguments = args.arguments;
    const promptArguments =
      rawArguments &&
      typeof rawArguments === "object" &&
      !Array.isArray(rawArguments)
        ? (rawArguments as Record<string, unknown>)
        : undefined;

    // Only loaded when the name could be one: a built-in must not wait on
    // NetSuite, and must still work when no account is connected.
    const netsuitePrompts = name.startsWith(NETSUITE_PROMPT_PREFIX)
      ? await loadNetSuitePromptsOrNone(principal)
      : [];

    const resolved = resolvePromptMessages(
      name,
      promptArguments,
      netsuitePrompts,
    );
    if (!resolved) {
      return toolError(
        `No briefing or prompt \`${name}\`. This server publishes ${publishedPromptNames(
          netsuitePrompts,
        )
          .map((entry) => `\`${entry}\``)
          .join(", ")}.`,
      );
    }

    const text = resolved.messages
      .map((message) => message.content.text)
      .join("\n\n");

    return toolResult(
      {
        name,
        description: resolved.description,
        messages: resolved.messages,
      },
      text,
    );
  },
};

export const promptTools: McpToolDefinition[] = [
  listPrompts,
  getPrompt,
  runBriefing,
];

/**
 * The account's prompt library, for `prompts/list`.
 *
 * Returns nothing rather than an error when NetSuite is unreachable, the
 * account is unconnected, or the library tool is switched off: this runs on
 * connect, and a client that cannot list prompts shows the person nothing at
 * all. The built-in prompts stand on their own, and osmcp_list_prompts still
 * reports the reason to an agent that asks.
 */
export async function loadNetSuitePromptsOrNone(
  principal: McpPrincipal,
): Promise<NetSuitePrompt[]> {
  try {
    const outcome = await loadPromptLibrary(principal);
    return outcome.ok ? outcome.prompts : [];
  } catch {
    return [];
  }
}

export { fillPrompt } from "@/lib/netsuite/prompt-library";
