import { normalizeNetSuiteAccountId } from "./accounts";

export type NetsuiteMcpToolSettings = {
  byAccount: Record<string, { disabledNames: string[] }>;
};

export const EMPTY_NETSUITE_MCP_TOOL_SETTINGS: NetsuiteMcpToolSettings = {
  byAccount: {},
};

const MAX_DISABLED_NAMES = 256;
const MAX_TOOL_NAME_LENGTH = 256;

export function parseNetsuiteMcpToolSettings(
  value: unknown,
): NetsuiteMcpToolSettings {
  if (!value || typeof value !== "object") {
    return { byAccount: {} };
  }
  const record = value as { byAccount?: unknown };
  if (!record.byAccount || typeof record.byAccount !== "object") {
    return { byAccount: {} };
  }

  const byAccount: Record<string, { disabledNames: string[] }> = {};
  for (const [rawAccountId, entry] of Object.entries(record.byAccount)) {
    const accountId = normalizeNetSuiteAccountId(rawAccountId);
    if (!accountId) {
      continue;
    }
    const disabledNames = Array.isArray(
      (entry as { disabledNames?: unknown })?.disabledNames,
    )
      ? (entry as { disabledNames: unknown[] }).disabledNames
          .filter(
            (name): name is string =>
              typeof name === "string" &&
              name.trim().length > 0 &&
              name.length <= MAX_TOOL_NAME_LENGTH,
          )
          .map((name) => name.trim())
          .slice(0, MAX_DISABLED_NAMES)
      : [];
    byAccount[accountId] = { disabledNames: uniqueNames(disabledNames) };
  }

  return { byAccount };
}

export function disabledMcpToolNames(
  settings: NetsuiteMcpToolSettings | null | undefined,
  accountId: string | null | undefined,
): string[] {
  if (!accountId?.trim()) {
    return [];
  }
  const parsed = parseNetsuiteMcpToolSettings(settings);
  const key = normalizeNetSuiteAccountId(accountId);
  return parsed.byAccount[key]?.disabledNames ?? [];
}

export function isMcpToolDisabled(
  settings: NetsuiteMcpToolSettings | null | undefined,
  accountId: string | null | undefined,
  toolName: string,
): boolean {
  if (!toolName.trim()) {
    return false;
  }
  return disabledMcpToolNames(settings, accountId).includes(toolName);
}

/** Opt-out denylist: missing settings or unknown tools stay allowed. */
export function isMcpToolAllowed(
  settings: NetsuiteMcpToolSettings | null | undefined,
  accountId: string | null | undefined,
  toolName: string,
): boolean {
  return !isMcpToolDisabled(settings, accountId, toolName);
}

export function isMcpToolInDisabledList(
  disabledNames: string[],
  toolName: string,
): boolean {
  if (!toolName.trim()) {
    return false;
  }
  return disabledNames.includes(toolName);
}

export const MCP_TOOL_DISABLED_MESSAGE =
  "This NetSuite MCP tool is disabled in Settings.";

export function assertMcpToolCallAllowed(
  settings: NetsuiteMcpToolSettings | null | undefined,
  accountId: string | null | undefined,
  toolName: string,
): void {
  if (!isMcpToolAllowed(settings, accountId, toolName)) {
    throw new Error(MCP_TOOL_DISABLED_MESSAGE);
  }
}

export function withMcpToolDisabledNames(
  existing: NetsuiteMcpToolSettings | null | undefined,
  accountId: string,
  disabledNames: string[],
): NetsuiteMcpToolSettings {
  const parsed = parseNetsuiteMcpToolSettings(existing);
  const key = normalizeNetSuiteAccountId(accountId);
  if (!key) {
    return parsed;
  }
  return {
    byAccount: {
      ...parsed.byAccount,
      [key]: {
        disabledNames: uniqueNames(
          disabledNames
            .map((name) => name.trim())
            .filter(
              (name) => name.length > 0 && name.length <= MAX_TOOL_NAME_LENGTH,
            )
            .slice(0, MAX_DISABLED_NAMES),
        ),
      },
    },
  };
}

export function mergeNetsuiteMcpToolSettings(
  existing: NetsuiteMcpToolSettings | null | undefined,
  incoming: NetsuiteMcpToolSettings | null | undefined,
): NetsuiteMcpToolSettings {
  const current = parseNetsuiteMcpToolSettings(existing);
  const next = parseNetsuiteMcpToolSettings(incoming);
  return {
    byAccount: {
      ...current.byAccount,
      ...next.byAccount,
    },
  };
}

export function fallbackMcpToolLabel(tool: {
  name: string;
  description?: string | null;
  annotations?: { title?: string | null };
}): { displayName: string; description: string } {
  const title = tool.annotations?.title?.trim();
  const slug = tool.name.replace(/^ns_/i, "").replace(/[_-]+/g, " ").trim();
  const displayName =
    title ||
    (slug ? slug.replace(/\b\w/g, (char) => char.toUpperCase()) : tool.name);
  return {
    displayName,
    description: tool.description?.trim() || "No description available",
  };
}

function uniqueNames(names: string[]): string[] {
  return [...new Set(names)];
}
