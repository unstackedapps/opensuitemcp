"use client";

import { useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useAppPortal } from "@/components/portal/context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  connectedAccountSelection,
  formatNetSuiteAccountDisplay,
  type NetSuiteAccountEntry,
  normalizeNetSuiteAccountId,
} from "@/lib/netsuite/accounts";
import { CheckCircleFillIcon, ChevronDownIcon } from "./icons";
import { toast } from "./toast";

type NetSuiteStatusResponse = {
  connected: boolean;
  connectedAccountIds?: string[];
  activeAccountId?: string | null;
  accounts?: NetSuiteAccountEntry[];
};

async function fetchNetSuiteStatus(): Promise<NetSuiteStatusResponse> {
  const response = await fetch("/api/netsuite/status");
  if (response.status === 401) {
    return { connected: false, connectedAccountIds: [], accounts: [] };
  }
  if (!response.ok) {
    throw new Error("Failed to load NetSuite accounts");
  }
  return response.json();
}

function connectedAccounts(
  status: NetSuiteStatusResponse | undefined,
): NetSuiteAccountEntry[] {
  if (!status) {
    return [];
  }
  const listed = status.accounts ?? [];
  const connectedIds = new Set(
    (status.connectedAccountIds ?? []).map((id) =>
      normalizeNetSuiteAccountId(id),
    ),
  );
  if (connectedIds.size === 0) {
    return [];
  }
  const fromList = listed.filter((account) =>
    connectedIds.has(account.accountId),
  );
  const extraIds = [...connectedIds].filter(
    (accountId) => !fromList.some((account) => account.accountId === accountId),
  );
  return [
    ...fromList,
    ...extraIds.map((accountId) => ({ accountId, label: accountId })),
  ];
}

export function NetSuiteAccountSwitcher() {
  const { mutate } = useSWRConfig();
  const { openPortal } = useAppPortal();
  const { data: status } = useSWR("netsuite-status", fetchNetSuiteStatus, {
    revalidateOnFocus: true,
    refreshInterval: 60_000,
  });
  const [open, setOpen] = useState(false);
  const accounts = useMemo(() => connectedAccounts(status), [status]);
  const selected = useMemo(
    () => connectedAccountSelection(accounts, status?.activeAccountId),
    [accounts, status?.activeAccountId],
  );

  const handleSelect = async (account: NetSuiteAccountEntry) => {
    setOpen(false);
    if (account.accountId === selected?.accountId) {
      return;
    }
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          netsuiteAccountId: account.accountId,
          netsuiteClientId: account.clientId ?? null,
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to switch NetSuite account");
      }
      await Promise.all([mutate("netsuite-status"), mutate("settings")]);
      toast({
        type: "success",
        description: `Using ${formatNetSuiteAccountDisplay(account)}`,
      });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to switch NetSuite account",
      });
    }
  };

  if (accounts.length === 0) {
    return (
      <Button
        className="h-8 px-2 focus-visible:ring-0"
        onClick={() => openPortal("netsuite")}
        type="button"
        variant="ghost"
      >
        <span className="max-w-35 truncate font-medium text-xs">NetSuite</span>
      </Button>
    );
  }

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button
          className="h-8 px-2 focus-visible:ring-0"
          type="button"
          variant="ghost"
        >
          <span className="max-w-35 truncate font-medium text-xs">
            {selected ? formatNetSuiteAccountDisplay(selected) : "NetSuite"}
          </span>
          <ChevronDownIcon size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-55">
        {accounts.map((account) => (
          <DropdownMenuItem
            key={account.accountId}
            onSelect={() => {
              void handleSelect(account);
            }}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm">
                  {formatNetSuiteAccountDisplay(account)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {account.label?.trim() &&
                  account.label.trim().toLowerCase() !== account.accountId
                    ? account.accountId
                    : "Connected"}
                </p>
              </div>
              {account.accountId === selected?.accountId ? (
                <CheckCircleFillIcon />
              ) : null}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
