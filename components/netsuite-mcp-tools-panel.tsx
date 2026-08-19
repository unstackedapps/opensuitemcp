"use client";

import { ChevronDown, Wrench } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatNetSuiteAccountDisplay,
  normalizeNetSuiteAccountId,
} from "@/lib/netsuite/accounts";
import { cn } from "@/lib/utils";
import { toast } from "./toast";

type McpToolRow = {
  originalName: string;
  displayName: string;
  description: string;
  allowed: boolean;
};

type McpToolsResponse = {
  connected: boolean;
  accountId: string | null;
  tools?: McpToolRow[];
  error?: string;
  message?: string;
};

export function mcpToolsUrl(accountId: string): string {
  return `/api/netsuite/mcp-tools?accountId=${encodeURIComponent(accountId)}`;
}

export async function fetchMcpTools(url: string): Promise<McpToolsResponse> {
  const response = await fetch(url);
  const data = (await response.json().catch(() => ({}))) as McpToolsResponse;
  if (!response.ok) {
    throw new Error(data.message || data.error || "Failed to load MCP tools");
  }
  return data;
}

export function formatMcpToolsAvailableLabel(total: number): string {
  return `${total} MCP tool${total === 1 ? "" : "s"}`;
}

/** Shared SWR summary so account rows and the tools list stay in sync. */
export function useNetSuiteMcpToolSummary(
  accountId: string,
  enabled: boolean,
): {
  total: number | null;
  allowed: number | null;
  isLoading: boolean;
} {
  const { data, isLoading } = useSWR(
    enabled && accountId ? mcpToolsUrl(accountId) : null,
    fetchMcpTools,
    { revalidateOnFocus: false },
  );
  if (!data?.connected || !data.tools) {
    return {
      total: null,
      allowed: null,
      isLoading: Boolean(enabled && isLoading),
    };
  }
  const total = data.tools.length;
  const allowed = data.tools.filter((tool) => tool.allowed !== false).length;
  return { total, allowed, isLoading: false };
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-border/60 px-3 py-4 text-muted-foreground text-sm">
      {message}
    </div>
  );
}

const MCP_TOOL_DESCRIPTION_COLLAPSE_CHARS = 120;

function McpToolDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const trimmed = description.trim();

  if (!trimmed) {
    return null;
  }

  const collapsible =
    trimmed.length > MCP_TOOL_DESCRIPTION_COLLAPSE_CHARS ||
    trimmed.includes("\n");

  return (
    <div className="w-full min-w-0 space-y-0.5">
      <p
        className={cn(
          "text-muted-foreground text-xs leading-relaxed",
          !expanded && collapsible && "line-clamp-2",
        )}
      >
        {trimmed}
      </p>
      {collapsible ? (
        <button
          className="inline-flex items-center gap-0.5 text-muted-foreground text-xs hover:text-foreground"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? "Show less" : "Show more"}
          <ChevronDown
            className={cn(
              "size-3 shrink-0 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
      ) : null}
    </div>
  );
}

async function persistDisabledNames(
  accountId: string,
  disabledNames: string[],
): Promise<void> {
  const normalizedAccountId = normalizeNetSuiteAccountId(accountId);
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      netsuiteMcpTools: {
        byAccount: {
          [normalizedAccountId]: { disabledNames },
        },
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Failed to save tool access");
  }
}

export function NetSuiteMcpToolsPanel({
  accountId,
  active,
  connected,
}: {
  accountId: string;
  active: boolean;
  connected: boolean;
}) {
  const shouldFetch = active && connected && Boolean(accountId);
  const toolsUrl = shouldFetch ? mcpToolsUrl(accountId) : null;
  const { data, error, isLoading, mutate } = useSWR(toolsUrl, fetchMcpTools, {
    revalidateOnFocus: false,
  });
  const [pending, setPending] = useState(false);

  const tools = data?.tools ?? [];
  const sortedTools = [...tools].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );

  const applyToolAccess = async (
    nextTools: McpToolRow[],
    previous: McpToolRow[],
  ) => {
    const disabledNames = nextTools
      .filter((tool) => !tool.allowed)
      .map((tool) => tool.originalName);

    setPending(true);
    await mutate(
      data
        ? { ...data, tools: nextTools }
        : { connected: true, accountId, tools: nextTools },
      { revalidate: false },
    );

    try {
      await persistDisabledNames(accountId, disabledNames);
    } catch (persistError) {
      await mutate(data ? { ...data, tools: previous } : undefined, {
        revalidate: false,
      });
      toast({
        type: "error",
        description:
          persistError instanceof Error
            ? persistError.message
            : "Failed to save tool access",
      });
    } finally {
      setPending(false);
    }
  };

  const handleAccessChange = async (
    toolName: string,
    access: "allowed" | "disabled",
  ) => {
    if (pending) {
      return;
    }
    const nextTools = tools.map((tool) =>
      tool.originalName === toolName
        ? { ...tool, allowed: access === "allowed" }
        : tool,
    );
    await applyToolAccess(nextTools, tools);
  };

  const handleBulkAccess = async (access: "allowed" | "disabled") => {
    if (pending || tools.length === 0) {
      return;
    }
    const allowed = access === "allowed";
    if (tools.every((tool) => tool.allowed === allowed)) {
      return;
    }
    const nextTools = tools.map((tool) => ({ ...tool, allowed }));
    await applyToolAccess(nextTools, tools);
  };

  if (!connected || data?.connected === false) {
    return (
      <EmptyState message="Connect this account to configure its MCP tools." />
    );
  }

  if (!accountId) {
    return (
      <EmptyState message="Select a NetSuite account to manage MCP tools." />
    );
  }

  if (isLoading && !data) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-4 text-sm">
        {error instanceof Error
          ? error.message
          : "Could not load NetSuite MCP tools."}
      </div>
    );
  }

  if (sortedTools.length === 0) {
    return (
      <EmptyState message="No MCP tools are available. Confirm AI Connector and MCP Standard Tools are enabled, then reconnect." />
    );
  }

  const allAllowed = sortedTools.every((tool) => tool.allowed !== false);
  const allDisabled = sortedTools.every((tool) => tool.allowed === false);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending || allDisabled}
          onClick={() => {
            void handleBulkAccess("disabled");
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Disable all
        </Button>
        <Button
          disabled={pending || allAllowed}
          onClick={() => {
            void handleBulkAccess("allowed");
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Allow all
        </Button>
      </div>
      {sortedTools.map((tool) => (
        <div
          className="flex flex-col gap-2 rounded-md border border-border/60 px-3 py-2.5"
          key={tool.originalName}
        >
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <p className="font-medium text-sm">{tool.displayName}</p>
              {tool.originalName === tool.displayName ? null : (
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {tool.originalName}
                </p>
              )}
            </div>
            <Select
              disabled={pending}
              onValueChange={(value) => {
                if (value === "allowed" || value === "disabled") {
                  void handleAccessChange(tool.originalName, value);
                }
              }}
              value={tool.allowed === false ? "disabled" : "allowed"}
            >
              <SelectTrigger
                aria-label={`${tool.displayName} access`}
                className="h-8 w-full text-xs sm:w-30 sm:shrink-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allowed">Allowed</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <McpToolDescription description={tool.description} />
        </div>
      ))}
    </div>
  );
}

export function NetSuiteMcpToolsSection({
  accountId,
  accountLabel,
  active,
  connected,
  nested = false,
}: {
  accountId: string;
  accountLabel?: string;
  active: boolean;
  connected: boolean;
  /** When true, sits under the account row (no outer top border). */
  nested?: boolean;
}) {
  const scopeLabel = formatNetSuiteAccountDisplay({
    accountId,
    label: accountLabel,
  });
  return (
    <div
      className={
        nested ? "space-y-2 pt-1" : "space-y-3 border-border/60 border-t pt-3"
      }
    >
      <div className="space-y-1">
        <p className="flex items-center gap-1.5 font-medium text-sm">
          <Wrench className="size-3.5 text-muted-foreground" />
          MCP tools for {scopeLabel}
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Allowed or disabled for this account. Changes apply immediately. All
          tools stay allowed by default.
        </p>
      </div>
      <NetSuiteMcpToolsPanel
        accountId={accountId}
        active={active}
        connected={connected}
      />
    </div>
  );
}
