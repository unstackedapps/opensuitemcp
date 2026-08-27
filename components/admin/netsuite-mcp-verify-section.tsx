"use client";

import { useState } from "react";
import {
  adminProbeNetSuiteMcpAccount,
  adminStartNetSuiteMcpTestConnect,
} from "@/app/admin/netsuite/mcp/actions";
import { ADMIN_CONTROL_CLASS } from "@/components/admin/admin-shell";
import { LoaderIcon } from "@/components/icons";
import { INFO_NOTICE_STATUS_CLASS } from "@/components/info-notice-styles";
import {
  type NetSuiteDcrProbeState,
  NetSuiteIntegrationSetupCard,
} from "@/components/netsuite-integration-setup-card";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
  formatNetSuiteAccountDisplay,
  getNetSuiteNewIntegrationUrl,
  getNetSuiteRedirectUri,
  NETSUITE_DCR_CLIENT_NAME,
} from "@/lib/netsuite/accounts";
import type { AdminNetSuiteMcpProbeResult } from "@/lib/org/admin/netsuite-mcp-verify";
import type { OrgNetSuiteMcpAccountRow } from "@/lib/org/netsuite-mcp-accounts";
import { cn } from "@/lib/utils";

function statusLabel(account: OrgNetSuiteMcpAccountRow): string {
  switch (account.integrationStatus) {
    case "connected":
      return "OAuth verified";
    case "ready":
      return "Integration ready";
    case "needs_integration":
      return "Setup required";
    case "error":
      return "Check failed";
    default:
      return "Not checked";
  }
}

function statusClass(account: OrgNetSuiteMcpAccountRow): string {
  switch (account.integrationStatus) {
    case "connected":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300";
    case "ready":
      return "border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200";
    case "needs_integration":
      return INFO_NOTICE_STATUS_CLASS;
    case "error":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border/80 bg-muted/50 text-muted-foreground";
  }
}

function deriveAdminDcrProbeState({
  account,
  busy,
  probeDetail,
}: {
  account: OrgNetSuiteMcpAccountRow;
  busy: boolean;
  probeDetail: AdminNetSuiteMcpProbeResult | null;
}): NetSuiteDcrProbeState {
  if (busy) {
    return { status: "probing" };
  }

  if (probeDetail?.status === "error") {
    return { status: "error", error: probeDetail.error };
  }

  if (probeDetail?.status === "needs_integration") {
    return {
      status: "needs_integration",
      accountId: probeDetail.accountId,
      integrationUrl: probeDetail.integrationUrl,
      redirectUri: probeDetail.redirectUri,
      dcrClientName: probeDetail.dcrClientName,
      checklist: probeDetail.checklist,
    };
  }

  if (account.integrationStatus === "needs_integration") {
    const redirectUri = getNetSuiteRedirectUri();
    return {
      status: "needs_integration",
      accountId: account.accountId,
      integrationUrl: getNetSuiteNewIntegrationUrl(account.accountId),
      redirectUri,
      dcrClientName: NETSUITE_DCR_CLIENT_NAME,
      checklist: [],
    };
  }

  if (
    account.integrationStatus === "error" &&
    account.integrationError?.trim()
  ) {
    return { status: "error", error: account.integrationError };
  }

  return { status: "idle" };
}

function shouldShowIntegrationSetup(dcrProbe: NetSuiteDcrProbeState): boolean {
  return (
    dcrProbe.status === "probing" ||
    dcrProbe.status === "needs_integration" ||
    dcrProbe.status === "error"
  );
}

type NetSuiteNetSuiteMcpVerifySectionProps = {
  account: OrgNetSuiteMcpAccountRow;
  actorConnected: boolean;
  onRefresh: () => void;
  oauthReturnPath?: string;
  prominentConnect?: boolean;
};

export function NetSuiteMcpVerifySection({
  account,
  actorConnected,
  onRefresh,
  oauthReturnPath,
  prominentConnect = false,
}: NetSuiteNetSuiteMcpVerifySectionProps) {
  const [busy, setBusy] = useState(false);
  const [probeDetail, setProbeDetail] =
    useState<AdminNetSuiteMcpProbeResult | null>(null);

  const dcrProbe = deriveAdminDcrProbeState({
    account,
    busy,
    probeDetail,
  });
  const showSetup = shouldShowIntegrationSetup(dcrProbe);
  const accountDisplay = formatNetSuiteAccountDisplay({
    accountId: account.accountId,
    label: account.name,
  });
  const integrationUrl =
    dcrProbe.status === "needs_integration"
      ? dcrProbe.integrationUrl
      : getNetSuiteNewIntegrationUrl(account.accountId);

  const runProbe = async () => {
    setBusy(true);
    const result = await adminProbeNetSuiteMcpAccount({
      netsuiteMcpAccountId: account.id,
    });
    setBusy(false);
    if (!result.ok) {
      toast({ type: "error", description: result.error });
      return;
    }
    setProbeDetail(result.result);
    if (result.result.status === "ready") {
      toast({
        type: "success",
        description: "Integration found.",
      });
    } else if (result.result.status === "needs_integration") {
      toast({
        type: "success",
        description: "Setup required.",
      });
    } else {
      toast({
        type: "error",
        description: result.result.error,
      });
    }
    onRefresh();
  };

  const runTestConnect = async () => {
    setBusy(true);
    const result = await adminStartNetSuiteMcpTestConnect({
      netsuiteMcpAccountId: account.id,
      returnPath: oauthReturnPath,
    });
    setBusy(false);
    if (!result.ok) {
      toast({ type: "error", description: result.error });
      return;
    }
    window.location.href = result.authorizeUrl;
  };

  const integrationVerified =
    account.integrationStatus === "ready" ||
    account.integrationStatus === "connected" ||
    probeDetail?.status === "ready";

  const showCheckIntegration = !showSetup && !integrationVerified;
  const showTestConnect = integrationVerified;
  const oauthAlreadyVerified =
    account.integrationStatus === "connected" || actorConnected;
  const testConnectLabel = oauthAlreadyVerified
    ? "Re-test OAuth connect"
    : "Test OAuth connect";
  const showActionButtons =
    !prominentConnect && (showCheckIntegration || showTestConnect);
  const showProminentConnect =
    prominentConnect && !actorConnected && showTestConnect;
  const showProminentCheck =
    prominentConnect && !actorConnected && showCheckIntegration;

  return (
    <div className="space-y-3 border-border/60 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-[10px] leading-none",
            statusClass(account),
          )}
        >
          {statusLabel(account)}
        </span>
        {actorConnected ? (
          <span className="text-[11px] text-muted-foreground">
            Your OAuth connected
          </span>
        ) : null}
        {account.integrationVerifiedAt ? (
          <span className="text-[11px] text-muted-foreground">
            Checked{" "}
            {new Date(account.integrationVerifiedAt).toLocaleDateString()}
          </span>
        ) : null}
      </div>

      {showProminentConnect ? (
        <div className="space-y-3 rounded-md border border-border/60 bg-muted/30 p-4">
          <div className="space-y-1">
            <p className="font-medium text-sm">
              Connect your NetSuite connection
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Sign in with NetSuite OAuth for {accountDisplay}. Your personal
              connection is required to finish onboarding.
            </p>
          </div>
          <Button
            className={cn(ADMIN_CONTROL_CLASS, "w-full sm:w-auto")}
            disabled={busy}
            onClick={() => void runTestConnect()}
            type="button"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block animate-spin">
                  <LoaderIcon size={14} />
                </span>
                Connecting…
              </span>
            ) : (
              "Connect with NetSuite"
            )}
          </Button>
        </div>
      ) : null}

      {showProminentCheck ? (
        <div className="space-y-3 rounded-md border border-border/60 bg-muted/30 p-4">
          <div className="space-y-1">
            <p className="font-medium text-sm">Check NetSuite integration</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Verify the integration record for {accountDisplay}, then connect
              with OAuth.
            </p>
          </div>
          <Button
            className={cn(ADMIN_CONTROL_CLASS, "w-full sm:w-auto")}
            disabled={busy}
            onClick={() => void runProbe()}
            type="button"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block animate-spin">
                  <LoaderIcon size={14} />
                </span>
                Checking…
              </span>
            ) : (
              "Check integration"
            )}
          </Button>
        </div>
      ) : null}

      {showActionButtons ? (
        <div className="flex flex-wrap gap-2">
          {showCheckIntegration ? (
            <Button
              className={ADMIN_CONTROL_CLASS}
              disabled={busy}
              onClick={() => void runProbe()}
              type="button"
            >
              {busy ? (
                <span className="inline-flex items-center gap-1">
                  <LoaderIcon size={12} />
                  Checking…
                </span>
              ) : (
                "Check integration"
              )}
            </Button>
          ) : null}
          {showTestConnect ? (
            <Button
              className={ADMIN_CONTROL_CLASS}
              disabled={busy}
              onClick={() => void runTestConnect()}
              type="button"
            >
              {testConnectLabel}
            </Button>
          ) : null}
        </div>
      ) : null}

      {showSetup ? (
        <NetSuiteIntegrationSetupCard
          accountDisplay={accountDisplay}
          accountId={account.accountId}
          controlClassName={ADMIN_CONTROL_CLASS}
          dcrProbe={dcrProbe}
          onOpenIntegration={() =>
            window.open(integrationUrl, "_blank", "noopener,noreferrer")
          }
          onProbe={() => void runProbe()}
        />
      ) : null}
    </div>
  );
}
