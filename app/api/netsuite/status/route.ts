import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getUserSettings } from "@/lib/db/queries";
import {
  normalizeNetSuiteAccountId,
  resolveNetSuiteAccounts,
} from "@/lib/netsuite/accounts";
import { loadNetSuiteMCPTools } from "@/lib/netsuite/mcp";
import {
  getNetSuiteToken,
  listConnectedNetSuiteAccountIds,
} from "@/lib/netsuite/tokens";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ connected: false }, { status: 401 });
  }

  const settings = await getUserSettings({ userId: session.user.id });
  const accounts = resolveNetSuiteAccounts(settings ?? {});
  const activeAccountId = settings?.netsuiteAccountId
    ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
    : (accounts[0]?.accountId ?? null);

  const connectedAccountIds = await listConnectedNetSuiteAccountIds(
    session.user.id,
  );
  const accessToken = activeAccountId
    ? await getNetSuiteToken(session.user.id, activeAccountId)
    : null;
  const isConnected = Boolean(accessToken);

  let toolCount = 0;
  if (isConnected) {
    try {
      const loaded = await loadNetSuiteMCPTools(session.user.id);
      toolCount = loaded.activeToolKeys.length;
    } catch (error) {
      console.error("[NetSuite Status] Error loading tools:", error);
    }
  }

  return NextResponse.json({
    connected: isConnected,
    connectedAccountIds,
    toolCount,
    activeAccountId,
    accounts,
  });
}
