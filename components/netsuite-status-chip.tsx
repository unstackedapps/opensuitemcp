"use client";

import useSWR from "swr";
import { useAppPortal } from "@/components/portal/context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatNetSuiteAccountDisplay,
  type NetSuiteAccountEntry,
} from "@/lib/netsuite/accounts";
import { cn } from "@/lib/utils";

type NetSuiteStatusResponse = {
  connected: boolean;
  toolCount?: number;
  activeAccountId?: string | null;
  accounts?: NetSuiteAccountEntry[];
};

async function fetchNetSuiteStatus(): Promise<NetSuiteStatusResponse> {
  const response = await fetch("/api/netsuite/status");
  if (response.status === 401) {
    return { connected: false };
  }
  if (!response.ok) {
    throw new Error("Failed to load NetSuite status");
  }
  return response.json();
}

function resolveAccountLabel(status: NetSuiteStatusResponse): string {
  const activeId = status.activeAccountId?.trim();
  if (!activeId) {
    return "NetSuite";
  }
  const match = status.accounts?.find(
    (account) => account.accountId === activeId,
  );
  return formatNetSuiteAccountDisplay({
    accountId: activeId,
    label: match?.label,
  });
}

export function NetSuiteStatusChip({ className }: { className?: string }) {
  const { openPortal } = useAppPortal();
  const { data, isLoading, error } = useSWR(
    "netsuite-status",
    fetchNetSuiteStatus,
    {
      revalidateOnFocus: true,
      refreshInterval: 60_000,
    },
  );

  const connected = data?.connected === true;
  const label = data ? resolveAccountLabel(data) : "NetSuite";
  const tooltip = error
    ? "Unable to check NetSuite connection"
    : isLoading
      ? "Checking NetSuite connection…"
      : connected
        ? `NetSuite connected · ${label}`
        : "NetSuite disconnected · Click to connect";

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={tooltip}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-md",
              "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              className,
            )}
            onClick={() => openPortal("netsuite")}
            type="button"
          >
            <span
              className={cn(
                "size-2.5 rounded-full",
                isLoading && "animate-pulse bg-muted-foreground/50",
                !isLoading &&
                  connected &&
                  "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]",
                !isLoading &&
                  !connected &&
                  "bg-orange-500 shadow-[0_0_0_3px_rgba(249,115,22,0.2)]",
              )}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
