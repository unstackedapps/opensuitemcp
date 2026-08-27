"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { NetSuiteMcpPanel } from "@/components/admin/netsuite-mcp-panel";
import { NetSuiteConnectPanel } from "@/components/netsuite-connect-panel";
import { toast } from "@/components/toast";
import {
  getDcrProbeForAccount,
  useNetSuiteDcrProbes,
} from "@/hooks/use-netsuite-dcr-probes";
import { NETSUITE_INTEGRATION_DOCS_URL } from "@/lib/constants";
import type { NetSuiteAccountEntry } from "@/lib/netsuite/accounts";
import {
  getNetSuiteNewIntegrationUrl,
  isNetSuiteAccountConnected,
  normalizeNetSuiteAccountId,
} from "@/lib/netsuite/accounts";
import type { OnboardingMode } from "@/lib/onboarding/types";
import type { OrgNetSuiteMcpAccountRow } from "@/lib/org/netsuite-mcp-accounts";

type SettingsResponse = {
  netsuiteAccounts?: NetSuiteAccountEntry[];
  netsuiteAccountId?: string | null;
  orgMcpPolicy?: {
    allowFreeAdd?: boolean;
    lockedAccountIds?: string[];
    addableAccounts?: NetSuiteAccountEntry[];
  };
};

type NetSuiteStatusResponse = {
  connected: boolean;
  connectedAccountIds: string[];
};

async function fetchSettings(): Promise<SettingsResponse> {
  const response = await fetch("/api/settings");
  if (!response.ok) {
    throw new Error("Failed to load settings.");
  }
  return response.json() as Promise<SettingsResponse>;
}

async function fetchNetSuiteStatus(): Promise<NetSuiteStatusResponse> {
  const response = await fetch("/api/netsuite/status");
  if (!response.ok) {
    return { connected: false, connectedAccountIds: [] };
  }
  return response.json() as Promise<NetSuiteStatusResponse>;
}

function SoloOnboardingMcpPanel({
  onRefresh,
}: {
  onRefresh: () => Promise<void>;
}) {
  const {
    data: settings,
    isLoading,
    mutate: refreshSettings,
  } = useSWR("onboarding-settings", fetchSettings);
  const { data: netsuiteStatus, mutate: refreshNetsuiteStatus } = useSWR(
    "onboarding-netsuite-status",
    fetchNetSuiteStatus,
  );

  const [netsuiteAccounts, setNetsuiteAccounts] = useState<
    NetSuiteAccountEntry[]
  >([]);
  const [netsuiteAccountId, setNetsuiteAccountId] = useState("");
  const [newAccountId, setNewAccountId] = useState("");
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [editingLabels, setEditingLabels] = useState<Record<string, string>>(
    {},
  );
  const [connectingAccountId, setConnectingAccountId] = useState<string | null>(
    null,
  );

  const { probes, probeAccount, setProbe } = useNetSuiteDcrProbes(
    netsuiteAccounts.map((account) => account.accountId),
    {
      getAccountLabel: (accountId) =>
        netsuiteAccounts.find((account) => account.accountId === accountId)
          ?.label,
      onProbeReady: async () => {
        await refreshSettings();
        await onRefresh();
      },
    },
  );

  useEffect(() => {
    if (!settings) {
      return;
    }
    const accounts = settings.netsuiteAccounts ?? [];
    setNetsuiteAccounts(accounts);
    const active =
      settings.netsuiteAccountId?.trim() || accounts[0]?.accountId || "";
    setNetsuiteAccountId(active);
    setEditingLabels(
      Object.fromEntries(
        accounts.map((account) => [account.accountId, account.label]),
      ),
    );
  }, [settings]);

  const selectedAccountId = netsuiteAccountId;
  const connectedAccountIds = netsuiteStatus?.connectedAccountIds ?? [];

  const persistAccounts = async (
    accounts: NetSuiteAccountEntry[],
    activeId: string,
  ) => {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        netsuiteAccounts: accounts,
        netsuiteAccountId: activeId || null,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Failed to save NetSuite accounts");
    }
  };

  const handleConnect = async (accountId: string) => {
    const normalized = normalizeNetSuiteAccountId(accountId);
    const probe = getDcrProbeForAccount(probes, normalized);
    if (!normalized || probe.status !== "ready") {
      return;
    }

    if (isNetSuiteAccountConnected(normalized, netsuiteStatus)) {
      return;
    }

    setConnectingAccountId(normalized);
    try {
      await fetch("/api/netsuite/set-return-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnPath: "/onboarding?step=mcp",
        }),
      });

      const response = await fetch("/api/netsuite/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: normalized }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to connect");
      }
      if (data.status === "needs_integration") {
        setProbe(normalized, {
          status: "needs_integration",
          accountId: data.accountId,
          integrationUrl: data.integrationUrl,
          redirectUri: data.redirectUri,
          dcrClientName: data.dcrClientName,
          checklist: data.checklist ?? [],
        });
        return;
      }
      window.location.href = data.authorizeUrl ?? "/api/netsuite/authorize";
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to connect",
      });
    } finally {
      setConnectingAccountId(null);
    }
  };

  const handleAddAccount = async () => {
    const accountId = normalizeNetSuiteAccountId(newAccountId);
    if (!accountId) {
      return;
    }
    const label = newAccountLabel.trim() || accountId;
    const nextAccounts = [
      ...netsuiteAccounts.filter((account) => account.accountId !== accountId),
      { accountId, label, clientId: null },
    ].sort((a, b) => a.label.localeCompare(b.label));

    try {
      await persistAccounts(nextAccounts, accountId);
      setNetsuiteAccounts(nextAccounts);
      setNetsuiteAccountId(accountId);
      setNewAccountId("");
      setNewAccountLabel("");
      await refreshSettings();
      await onRefresh();
      toast({ type: "success", description: `Added ${label}` });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to add connection",
      });
    }
  };

  return (
    <NetSuiteConnectPanel
      accounts={netsuiteAccounts}
      connectedAccountIds={connectedAccountIds}
      connectingAccountId={connectingAccountId}
      dcrProbesByAccountId={probes}
      editingLabels={editingLabels}
      embedded={{
        title: "NetSuite MCP Connections",
        description: (
          <>
            Add one or more NetSuite connections, complete the integration
            setup, then connect with OAuth. <IntegrationSetupLink />
          </>
        ),
      }}
      newAccountId={newAccountId}
      newAccountLabel={newAccountLabel}
      onAddAccount={() => {
        void handleAddAccount();
      }}
      onConnect={(accountId) => {
        void handleConnect(accountId);
      }}
      onDisconnect={async (accountId) => {
        const normalized = normalizeNetSuiteAccountId(accountId);
        const response = await fetch("/api/netsuite/disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: normalized }),
        });
        if (!response.ok) {
          toast({ type: "error", description: "Failed to disconnect." });
          return;
        }
        await refreshNetsuiteStatus();
        await onRefresh();
      }}
      onEditingLabelChange={(accountId, value) => {
        setEditingLabels((previous) => ({ ...previous, [accountId]: value }));
      }}
      onNewAccountIdChange={setNewAccountId}
      onNewAccountLabelChange={setNewAccountLabel}
      onOpenIntegration={(accountId) => {
        const normalized = normalizeNetSuiteAccountId(accountId);
        const probe = getDcrProbeForAccount(probes, normalized);
        const url =
          probe.status === "needs_integration"
            ? probe.integrationUrl
            : normalized
              ? getNetSuiteNewIntegrationUrl(normalized)
              : null;
        if (url) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      }}
      onProbe={(accountId) => {
        void probeAccount(accountId);
      }}
      onRemoveAccount={async (accountId) => {
        const normalized = normalizeNetSuiteAccountId(accountId);
        const nextAccounts = netsuiteAccounts.filter(
          (account) => account.accountId !== normalized,
        );
        const nextActive =
          netsuiteAccountId === normalized
            ? (nextAccounts[0]?.accountId ?? "")
            : netsuiteAccountId;
        await persistAccounts(nextAccounts, nextActive);
        setNetsuiteAccounts(nextAccounts);
        setNetsuiteAccountId(nextActive);
        await refreshSettings();
        await onRefresh();
      }}
      onRenameAccount={async (accountId) => {
        const normalized = normalizeNetSuiteAccountId(accountId);
        const label =
          editingLabels[normalized]?.trim() ||
          netsuiteAccounts.find((account) => account.accountId === normalized)
            ?.label ||
          normalized;
        const nextAccounts = netsuiteAccounts.map((account) =>
          account.accountId === normalized ? { ...account, label } : account,
        );
        await persistAccounts(nextAccounts, netsuiteAccountId);
        setNetsuiteAccounts(nextAccounts);
        await refreshSettings();
      }}
      onSelectAccount={async (accountId) => {
        setNetsuiteAccountId(accountId);
        await persistAccounts(netsuiteAccounts, accountId);
        await refreshSettings();
        await refreshNetsuiteStatus();
      }}
      selectedAccountId={selectedAccountId}
      settingsActive
      showSkeletons={isLoading && !settings}
      prominentConnect
    />
  );
}

type OnboardingMcpStepProps = {
  mode: OnboardingMode;
  mcpAccounts?: OrgNetSuiteMcpAccountRow[];
  connectedMcpAccountIds?: string[];
  actorId?: string;
  onRefresh: () => Promise<void>;
};

function IntegrationSetupLink() {
  return (
    <a
      className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
      href={NETSUITE_INTEGRATION_DOCS_URL}
      rel="noopener noreferrer"
      target="_blank"
    >
      Setup guide
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

export function OnboardingMcpStep({
  mode,
  mcpAccounts = [],
  connectedMcpAccountIds = [],
  onRefresh,
}: OnboardingMcpStepProps) {
  if (mode === "org") {
    return (
      <NetSuiteMcpPanel
        accounts={mcpAccounts}
        actorConnectedAccountIds={connectedMcpAccountIds}
        embedded={{
          title: "NetSuite MCP Connections",
          description: (
            <>
              Add MCP connections, verify integrations, then connect with
              NetSuite OAuth. <IntegrationSetupLink />
            </>
          ),
        }}
        oauthReturnPath="/onboarding?step=mcp"
      />
    );
  }

  return (
    <SoloOnboardingMcpPanel onRefresh={onRefresh} />
  );
}
