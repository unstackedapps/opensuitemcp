import "server-only";

import { listPersonasForClient } from "@/lib/ai/personas/catalog";
import {
  listCommunityCatalogSkills,
  listOracleCatalogSkills,
  normalizeUserSkillSettings,
} from "@/lib/ai/skills/catalog";
import {
  getChatById,
  getChatsByUserId,
  getMessagesByChatId,
  getUserSettings,
} from "@/lib/db/queries";
import {
  normalizeNetSuiteAccountId,
  resolveNetSuiteAccounts,
} from "@/lib/netsuite/accounts";
import {
  getNetSuiteToken,
  listConnectedNetSuiteAccountIds,
} from "@/lib/netsuite/tokens";
import { resolveMcpPolicy } from "../policy";
import {
  EMPTY_INPUT_SCHEMA,
  type McpToolDefinition,
  toolError,
  toolResult,
} from "./types";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const MAX_CHAT_PAGE = 50;
const MAX_MESSAGE_TEXT = 4000;

/**
 * Resolve which NetSuite account a call should act against. A key pinned to an
 * account always wins, so a credential handed to an external agent cannot be
 * redirected at another subsidiary by changing a UI preference.
 */
export function resolveAccountForPrincipal(params: {
  pinnedAccountId: string | null;
  settingsAccountId: string | null | undefined;
  fallbackAccountId?: string | null;
}): string | null {
  if (params.pinnedAccountId) {
    return normalizeNetSuiteAccountId(params.pinnedAccountId);
  }
  if (params.settingsAccountId) {
    return normalizeNetSuiteAccountId(params.settingsAccountId);
  }
  return params.fallbackAccountId
    ? normalizeNetSuiteAccountId(params.fallbackAccountId)
    : null;
}

const whoami: McpToolDefinition = {
  name: "osmcp_whoami",
  title: "Who am I",
  description:
    "Identify the OpenSuiteMCP user this connection acts as, the scopes the API key carries, and the NetSuite account calls will run against. Call this first to confirm the acting identity before doing work.",
  inputSchema: EMPTY_INPUT_SCHEMA,
  annotations: { title: "Who am I", ...READ_ONLY },
  requiredScope: "read",
  execute: async (_args, principal) => {
    const settings = await getUserSettings({ userId: principal.userId });
    const accounts = resolveNetSuiteAccounts(settings ?? {});
    const activeAccountId = resolveAccountForPrincipal({
      pinnedAccountId: principal.pinnedNetSuiteAccountId,
      settingsAccountId: settings?.netsuiteAccountId,
      fallbackAccountId: accounts[0]?.accountId,
    });
    const policy = await resolveMcpPolicy(principal.orgId);

    return toolResult({
      user: {
        id: principal.userId,
        email: principal.email,
        organizationId: principal.orgId,
      },
      key: {
        name: principal.keyName,
        scopes: principal.scopes,
        pinnedNetSuiteAccountId: principal.pinnedNetSuiteAccountId,
      },
      netsuite: {
        activeAccountId,
        accountPinnedToKey: Boolean(principal.pinnedNetSuiteAccountId),
        configuredAccountIds: accounts.map((entry) => entry.accountId),
      },
      policy: {
        writeScopeAllowed: policy.allowWriteScope,
        managedByOrganization: policy.managedByOrg,
      },
      timezone: settings?.timezone ?? "UTC",
    });
  },
};

const connectionStatus: McpToolDefinition = {
  name: "osmcp_connection_status",
  title: "NetSuite connection status",
  description:
    "Report whether the NetSuite connection is live and how many tools are available. Call this when a NetSuite tool fails unexpectedly: an expired refresh token requires a human to reconnect in the OpenSuiteMCP UI and cannot be repaired by retrying.",
  inputSchema: EMPTY_INPUT_SCHEMA,
  annotations: { title: "NetSuite connection status", ...READ_ONLY },
  requiredScope: "read",
  execute: async (_args, principal) => {
    const settings = await getUserSettings({ userId: principal.userId });
    const accounts = resolveNetSuiteAccounts(settings ?? {});
    const activeAccountId = resolveAccountForPrincipal({
      pinnedAccountId: principal.pinnedNetSuiteAccountId,
      settingsAccountId: settings?.netsuiteAccountId,
      fallbackAccountId: accounts[0]?.accountId,
    });

    if (!activeAccountId) {
      return toolResult({
        connected: false,
        activeAccountId: null,
        reason: "no_account_configured",
        remediation:
          "No NetSuite account is configured. A person must add one in OpenSuiteMCP under Settings -> NetSuite.",
      });
    }

    const connectedAccountIds = await listConnectedNetSuiteAccountIds(
      principal.userId,
    );
    const accessToken = await getNetSuiteToken(
      principal.userId,
      activeAccountId,
    );

    if (!accessToken) {
      return toolResult({
        connected: false,
        activeAccountId,
        connectedAccountIds,
        reason: "not_connected_or_token_expired",
        remediation:
          "The NetSuite authorization for this account is missing or its refresh token was rejected. A person must reconnect the account in OpenSuiteMCP under Settings -> NetSuite. Retrying will not help.",
      });
    }

    return toolResult({
      connected: true,
      activeAccountId,
      connectedAccountIds,
      accountPinnedToKey: Boolean(principal.pinnedNetSuiteAccountId),
    });
  },
};

const listNetSuiteAccounts: McpToolDefinition = {
  name: "osmcp_list_netsuite_accounts",
  title: "List NetSuite accounts",
  description:
    "List the NetSuite accounts this user has configured, which are authorized, and which one is active for tool calls.",
  inputSchema: EMPTY_INPUT_SCHEMA,
  annotations: { title: "List NetSuite accounts", ...READ_ONLY },
  requiredScope: "read",
  execute: async (_args, principal) => {
    const settings = await getUserSettings({ userId: principal.userId });
    const accounts = resolveNetSuiteAccounts(settings ?? {});
    const connectedAccountIds = await listConnectedNetSuiteAccountIds(
      principal.userId,
    );
    const activeAccountId = resolveAccountForPrincipal({
      pinnedAccountId: principal.pinnedNetSuiteAccountId,
      settingsAccountId: settings?.netsuiteAccountId,
      fallbackAccountId: accounts[0]?.accountId,
    });

    const rows = accounts.map((entry) => ({
      accountId: entry.accountId,
      label: entry.label,
      connected: connectedAccountIds.includes(entry.accountId),
      active: entry.accountId === activeAccountId,
    }));

    return toolResult({
      columns: ["accountId", "label", "connected", "active"],
      rows,
      activeAccountId,
      accountPinnedToKey: Boolean(principal.pinnedNetSuiteAccountId),
    });
  },
};

const listChats: McpToolDefinition = {
  name: "osmcp_list_chats",
  title: "List chats",
  description:
    "List this user's OpenSuiteMCP chat threads, newest first. Use it to find prior work before starting something new.",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        minimum: 1,
        maximum: MAX_CHAT_PAGE,
        default: 20,
        description: "How many chats to return.",
      },
    },
    additionalProperties: false,
  },
  annotations: { title: "List chats", ...READ_ONLY },
  requiredScope: "read",
  execute: async (args, principal) => {
    const requested =
      typeof args.limit === "number" ? Math.floor(args.limit) : 20;
    const limit = Math.min(Math.max(requested, 1), MAX_CHAT_PAGE);

    const page = await getChatsByUserId({
      id: principal.userId,
      limit,
      startingAfter: null,
      endingBefore: null,
    });

    const rows = page.chats.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      visibility: row.visibility,
    }));

    return toolResult({
      columns: ["id", "title", "createdAt", "visibility"],
      rows,
      hasMore: page.hasMore,
    });
  },
};

const getChat: McpToolDefinition = {
  name: "osmcp_get_chat",
  title: "Get chat transcript",
  description:
    "Read the messages of one OpenSuiteMCP chat owned by this user. Long message text is truncated.",
  inputSchema: {
    type: "object",
    properties: {
      chatId: {
        type: "string",
        description: "Chat id from osmcp_list_chats.",
      },
    },
    required: ["chatId"],
    additionalProperties: false,
  },
  annotations: { title: "Get chat transcript", ...READ_ONLY },
  requiredScope: "read",
  execute: async (args, principal) => {
    const chatId = typeof args.chatId === "string" ? args.chatId.trim() : "";
    if (!chatId) {
      return toolError("chatId is required.");
    }

    const chat = await getChatById({ id: chatId });
    // Report a missing chat and someone else's chat identically so this tool
    // cannot be used to probe which chat ids exist.
    if (!chat || chat.userId !== principal.userId) {
      return toolError(`No chat ${chatId} is available to this user.`);
    }

    const messages = await getMessagesByChatId({ id: chatId });
    const rows = messages.map((row) => ({
      id: row.id,
      role: row.role,
      createdAt: row.createdAt.toISOString(),
      text: extractMessageText(row.parts).slice(0, MAX_MESSAGE_TEXT),
    }));

    return toolResult({
      chat: {
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt.toISOString(),
        personaId: chat.personaId,
      },
      columns: ["id", "role", "createdAt", "text"],
      rows,
    });
  },
};

const listSkills: McpToolDefinition = {
  name: "osmcp_list_skills",
  title: "List skills",
  description:
    "List the Oracle and Community skill packs available to this user and which are enabled. Skills are instruction documents OpenSuiteMCP injects into its own chats; they describe NetSuite practice you may find useful as context.",
  inputSchema: EMPTY_INPUT_SCHEMA,
  annotations: { title: "List skills", ...READ_ONLY },
  requiredScope: "read",
  execute: async (_args, principal) => {
    const settings = await getUserSettings({ userId: principal.userId });
    const normalized = normalizeUserSkillSettings(settings ?? {});
    const enabled = new Set(normalized.enabledSkillIds);

    const rows = [
      ...listOracleCatalogSkills().map((skill) => ({
        id: skill.id,
        name: skill.name,
        source: "oracle",
        enabled: enabled.has(skill.id),
      })),
      ...listCommunityCatalogSkills().map((skill) => ({
        id: skill.id,
        name: skill.name,
        source: "community",
        enabled: enabled.has(skill.id),
      })),
    ];

    return toolResult({
      columns: ["id", "name", "source", "enabled"],
      rows,
    });
  },
};

const listPersonas: McpToolDefinition = {
  name: "osmcp_list_personas",
  title: "List personas",
  description:
    "List the OpenSuiteMCP personas available to this user. A persona is a NetSuite specialist playbook; its instructions can inform how you approach a task.",
  inputSchema: EMPTY_INPUT_SCHEMA,
  annotations: { title: "List personas", ...READ_ONLY },
  requiredScope: "read",
  execute: async (_args, principal) => {
    const settings = await getUserSettings({ userId: principal.userId });
    const rows = listPersonasForClient(settings?.customPersonas ?? []).map(
      (persona) => ({
        id: persona.id,
        name: persona.name,
        primaryRole: persona.primaryRole,
        source: persona.source,
      }),
    );

    return toolResult({
      columns: ["id", "name", "primaryRole", "source"],
      rows,
      defaultPersonaId: settings?.defaultPersonaId ?? null,
    });
  },
};

function extractMessageText(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }
  const chunks: string[] = [];
  for (const part of parts) {
    if (
      part &&
      typeof part === "object" &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      chunks.push((part as { text: string }).text);
    }
  }
  return chunks.join("\n\n");
}

export const workspaceTools: McpToolDefinition[] = [
  whoami,
  connectionStatus,
  listNetSuiteAccounts,
  listChats,
  getChat,
  listSkills,
  listPersonas,
];
