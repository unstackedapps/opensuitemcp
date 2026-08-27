import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getUserSettings, upsertUserSettings } from "@/lib/db/queries";
import {
  getNetSuiteIntegrationChecklist,
  getNetSuiteNewIntegrationUrl,
  getNetSuiteRedirectUri,
  NETSUITE_DCR_CLIENT_NAME,
  normalizeNetSuiteAccountId,
  resolveNetSuiteAccounts,
  upsertAccountEntry,
} from "@/lib/netsuite/accounts";
import { registerNetSuiteDcrClient } from "@/lib/netsuite/dcr";
import { assertOrgNetSuiteMcpConnectAllowed } from "@/lib/org/enforcement";
import { isOrgInstallMode } from "@/lib/org/install-config";
import { getOrgNetSuiteMcpAccountByAccountId } from "@/lib/org/netsuite-mcp-accounts";
import { orgNetSuiteMcpAccountLabel } from "@/lib/org/netsuite-mcp-user-sync";

const connectSchema = z.object({
  accountId: z.string().min(1).max(64),
  label: z.string().max(64).optional(),
  /** Optional manual override if DCR is unavailable */
  clientId: z.string().max(128).optional().nullable(),
});

/**
 * Start OAuth for an account that already has a resolved client_id.
 * Prefer /api/netsuite/probe on account selection; Connect assumes DCR is ready.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = connectSchema.parse(await request.json());
    const accountId = normalizeNetSuiteAccountId(body.accountId);

    if (isOrgInstallMode() && session.user.orgId) {
      await assertOrgNetSuiteMcpConnectAllowed({
        orgId: session.user.orgId,
        userId: session.user.id,
        accountId,
      });
    }

    const settings = await getUserSettings({ userId: session.user.id });
    let accounts = resolveNetSuiteAccounts(settings ?? {});
    const existing = accounts.find((item) => item.accountId === accountId);
    let label = body.label?.trim() || existing?.label || accountId;

    let orgMcp: Awaited<
      ReturnType<typeof getOrgNetSuiteMcpAccountByAccountId>
    > = null;
    if (isOrgInstallMode() && session.user.orgId) {
      orgMcp = await getOrgNetSuiteMcpAccountByAccountId(
        session.user.orgId,
        accountId,
      );
      if (orgMcp) {
        label = orgNetSuiteMcpAccountLabel(orgMcp);
      }
    }

    let clientId = body.clientId?.trim() || existing?.clientId?.trim() || null;

    if (orgMcp?.oauthClientId?.trim()) {
      clientId = orgMcp.oauthClientId.trim();
    }

    // Fallback probe if Connect is called without a prior successful probe
    if (!clientId) {
      const dcr = await registerNetSuiteDcrClient(accountId);
      if (dcr.status === "ready") {
        clientId = dcr.clientId;
      } else if (dcr.status === "needs_integration") {
        accounts = upsertAccountEntry(accounts, {
          accountId,
          label,
          clientId: existing?.clientId ?? null,
        });
        await upsertUserSettings({
          userId: session.user.id,
          netsuiteAccountId: accountId,
          netsuiteAccounts: accounts,
        });

        return NextResponse.json({
          status: "needs_integration",
          accountId,
          integrationUrl: getNetSuiteNewIntegrationUrl(accountId),
          redirectUri: getNetSuiteRedirectUri(),
          dcrClientName: NETSUITE_DCR_CLIENT_NAME,
          checklist: getNetSuiteIntegrationChecklist(getNetSuiteRedirectUri()),
        });
      } else {
        return NextResponse.json({ error: dcr.error }, { status: 400 });
      }
    }

    accounts = upsertAccountEntry(accounts, {
      accountId,
      label,
      clientId,
    });

    await upsertUserSettings({
      userId: session.user.id,
      netsuiteAccountId: accountId,
      netsuiteClientId: clientId,
      netsuiteAccounts: accounts,
    });

    return NextResponse.json({
      status: "ready",
      accountId,
      clientId,
      authorizeUrl: "/api/netsuite/authorize",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid connect request", details: error.errors },
        { status: 400 },
      );
    }

    console.error("[NetSuite Connect] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to prepare NetSuite connection",
      },
      { status: 500 },
    );
  }
}
