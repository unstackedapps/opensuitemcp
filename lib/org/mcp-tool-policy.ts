import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orgNetSuiteMcpAccount } from "@/lib/db/schema";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";
import {
  type NetsuiteMcpToolSettings,
  parseNetsuiteMcpToolSettings,
  withMcpToolDisabledNames,
} from "@/lib/netsuite/mcp-tool-settings";
import { isOrgInstallMode } from "@/lib/org/install-config";

const MAX_DISABLED_NAMES = 256;
const MAX_TOOL_NAME_LENGTH = 256;

function normalizeDisabledNames(names: string[]): string[] {
  return [
    ...new Set(
      names
        .map((name) => name.trim())
        .filter(
          (name) => name.length > 0 && name.length <= MAX_TOOL_NAME_LENGTH,
        )
        .slice(0, MAX_DISABLED_NAMES),
    ),
  ];
}

export async function getOrgMcpDisabledToolNames({
  orgId,
  accountId,
}: {
  orgId: string;
  accountId: string;
}): Promise<string[]> {
  const normalizedAccountId = normalizeNetSuiteAccountId(accountId);
  if (!normalizedAccountId) {
    return [];
  }

  const [row] = await db
    .select({
      mcpDisabledToolNames: orgNetSuiteMcpAccount.mcpDisabledToolNames,
    })
    .from(orgNetSuiteMcpAccount)
    .where(
      and(
        eq(orgNetSuiteMcpAccount.orgId, orgId),
        eq(orgNetSuiteMcpAccount.accountId, normalizedAccountId),
      ),
    )
    .limit(1);

  return normalizeDisabledNames(row?.mcpDisabledToolNames ?? []);
}

export async function setOrgMcpDisabledToolNames({
  orgId,
  netsuiteMcpAccountId,
  disabledNames,
}: {
  orgId: string;
  netsuiteMcpAccountId: string;
  disabledNames: string[];
}): Promise<void> {
  await db
    .update(orgNetSuiteMcpAccount)
    .set({
      mcpDisabledToolNames: normalizeDisabledNames(disabledNames),
    })
    .where(
      and(
        eq(orgNetSuiteMcpAccount.id, netsuiteMcpAccountId),
        eq(orgNetSuiteMcpAccount.orgId, orgId),
      ),
    );
}

export async function resolveEffectiveNetsuiteMcpToolSettings({
  orgId,
  accountId,
  userSettings,
}: {
  orgId: string | null | undefined;
  accountId: string | null | undefined;
  userSettings: NetsuiteMcpToolSettings | null | undefined;
}): Promise<NetsuiteMcpToolSettings> {
  const userParsed = parseNetsuiteMcpToolSettings(userSettings);
  const normalizedAccountId = accountId
    ? normalizeNetSuiteAccountId(accountId)
    : null;

  if (!isOrgInstallMode() || !orgId || !normalizedAccountId) {
    return userParsed;
  }

  const orgDisabled = await getOrgMcpDisabledToolNames({
    orgId,
    accountId: normalizedAccountId,
  });
  const userDisabled =
    userParsed.byAccount[normalizedAccountId]?.disabledNames ?? [];
  const mergedDisabled = normalizeDisabledNames([
    ...orgDisabled,
    ...userDisabled,
  ]);

  return withMcpToolDisabledNames(
    userParsed,
    normalizedAccountId,
    mergedDisabled,
  );
}

export function clampUserMcpToolPatch({
  orgDisabledNames,
  accountId,
  incomingDisabledNames,
}: {
  orgDisabledNames: string[];
  accountId: string;
  incomingDisabledNames: string[];
}): string[] {
  const normalizedAccountId = normalizeNetSuiteAccountId(accountId);
  if (!normalizedAccountId) {
    return normalizeDisabledNames(incomingDisabledNames);
  }

  return normalizeDisabledNames([
    ...orgDisabledNames,
    ...incomingDisabledNames,
  ]);
}
