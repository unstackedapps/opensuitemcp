"use client";

import { ChevronDown, Wrench } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { adminSetOrgMcpDisabledToolNames } from "@/app/admin/netsuite/mcp/actions";
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_SELECT_TRIGGER_CLASS,
} from "@/components/admin/admin-shell";
import { INFO_NOTICE_STATUS_CLASS } from "@/components/info-notice-styles";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { OrgNetSuiteMcpAccountRow } from "@/lib/org/netsuite-mcp-accounts";
import { cn } from "@/lib/utils";

type AdminMcpToolRow = {
  originalName: string;
  displayName: string;
  description: string;
  enabledByOrg: boolean;
};

type AdminMcpToolsResponse = {
  connected: boolean;
  accountId: string;
  tools?: AdminMcpToolRow[];
  message?: string;
  error?: string;
};

function adminMcpToolsUrl(netsuiteMcpAccountId: string): string {
  return `/api/admin/netsuite/mcp-tools?netsuiteMcpAccountId=${encodeURIComponent(
    netsuiteMcpAccountId,
  )}`;
}

async function fetchAdminMcpTools(url: string): Promise<AdminMcpToolsResponse> {
  const response = await fetch(url);
  const data = (await response
    .json()
    .catch(() => ({}))) as AdminMcpToolsResponse;
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to load MCP tools");
  }
  return data;
}

function McpToolDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const trimmed = description.trim();

  if (!trimmed) {
    return null;
  }

  const collapsible = trimmed.length > 120 || trimmed.includes("\n");

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

export function AdminNetSuiteMcpToolsSection({
  account,
  actorConnected,
}: {
  account: OrgNetSuiteMcpAccountRow;
  actorConnected: boolean;
}) {
  const shouldFetch = actorConnected && account.enabled;
  const toolsUrl = shouldFetch ? adminMcpToolsUrl(account.id) : null;
  const { data, error, isLoading, mutate } = useSWR(
    toolsUrl,
    fetchAdminMcpTools,
    {
      revalidateOnFocus: false,
    },
  );
  const [pending, setPending] = useState(false);
  const [sectionExpanded, setSectionExpanded] = useState(false);

  const tools = data?.tools ?? [];
  const sortedTools = [...tools].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
  const allowedByOrgCount = sortedTools.filter(
    (tool) => tool.enabledByOrg,
  ).length;
  const sectionSummary =
    sortedTools.length > 0
      ? `${sortedTools.length} tool${sortedTools.length === 1 ? "" : "s"} · ${allowedByOrgCount} allowed`
      : isLoading
        ? "Loading…"
        : null;

  const persistDisabled = async (disabledNames: string[]) => {
    const result = await adminSetOrgMcpDisabledToolNames({
      netsuiteMcpAccountId: account.id,
      disabledNames,
    });
    if (!result.ok) {
      throw new Error(result.error ?? "Failed to save tool policy");
    }
  };

  const applyToolAccess = async (
    nextTools: AdminMcpToolRow[],
    previous: AdminMcpToolRow[],
  ) => {
    const disabledNames = nextTools
      .filter((tool) => !tool.enabledByOrg)
      .map((tool) => tool.originalName);

    setPending(true);
    await mutate(
      data
        ? { ...data, tools: nextTools }
        : {
            connected: true,
            accountId: account.accountId,
            tools: nextTools,
          },
      { revalidate: false },
    );

    try {
      await persistDisabled(disabledNames);
    } catch (persistError) {
      await mutate(data ? { ...data, tools: previous } : undefined, {
        revalidate: false,
      });
      toast({
        type: "error",
        description:
          persistError instanceof Error
            ? persistError.message
            : "Failed to save tool policy",
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
        ? { ...tool, enabledByOrg: access === "allowed" }
        : tool,
    );
    await applyToolAccess(nextTools, tools);
  };

  const handleBulkAccess = async (access: "allowed" | "disabled") => {
    if (pending || tools.length === 0) {
      return;
    }
    const enabledByOrg = access === "allowed";
    if (tools.every((tool) => tool.enabledByOrg === enabledByOrg)) {
      return;
    }
    const nextTools = tools.map((tool) => ({ ...tool, enabledByOrg }));
    await applyToolAccess(nextTools, tools);
  };

  return (
    <div className="space-y-2 border-border/60 border-t pt-3">
      <button
        className="flex w-full min-w-0 items-start gap-2 text-left"
        onClick={() => setSectionExpanded((value) => !value)}
        type="button"
      >
        <ChevronDown
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
            sectionExpanded && "rotate-180",
          )}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium text-sm">
            <Wrench className="size-3.5 text-muted-foreground" />
            <span>Org MCP tool policy</span>
            {sectionSummary ? (
              <span className="text-muted-foreground text-xs">
                {sectionSummary}
              </span>
            ) : null}
          </p>
          <p className="text-muted-foreground text-xs">
            Ceiling for member tool access.
          </p>
        </div>
      </button>

      {sectionExpanded ? (
        <div className="space-y-2">
          {!actorConnected ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 font-medium text-[11px] leading-none",
                INFO_NOTICE_STATUS_CLASS,
              )}
            >
              Connect OAuth to configure tools.
            </span>
          ) : null}

          {actorConnected && isLoading && !data ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : null}

          {error ? (
            <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 font-medium text-[11px] text-destructive leading-none">
              {error instanceof Error
                ? error.message
                : "Could not load MCP tools."}
            </span>
          ) : null}

          {actorConnected && sortedTools.length > 0 ? (
            <>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  className={ADMIN_CONTROL_CLASS}
                  disabled={
                    pending || sortedTools.every((tool) => !tool.enabledByOrg)
                  }
                  onClick={() => {
                    void handleBulkAccess("disabled");
                  }}
                  type="button"
                  variant="outline"
                >
                  Disable all
                </Button>
                <Button
                  className={ADMIN_CONTROL_CLASS}
                  disabled={
                    pending || sortedTools.every((tool) => tool.enabledByOrg)
                  }
                  onClick={() => {
                    void handleBulkAccess("allowed");
                  }}
                  type="button"
                  variant="outline"
                >
                  Allow all
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {sortedTools.map((tool) => (
                  <div
                    className="flex flex-col gap-2 rounded-md border border-border/60 px-3 py-2.5"
                    key={tool.originalName}
                  >
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                        <p className="font-medium text-sm">
                          {tool.displayName}
                        </p>
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
                        value={tool.enabledByOrg ? "allowed" : "disabled"}
                      >
                        <SelectTrigger
                          aria-label={`${tool.displayName} org access`}
                          className={cn(
                            ADMIN_SELECT_TRIGGER_CLASS,
                            "w-full sm:w-30 sm:shrink-0",
                          )}
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
            </>
          ) : null}

          {actorConnected && data && sortedTools.length === 0 ? (
            <span className="inline-flex items-center rounded-full border border-border/80 bg-muted/50 px-2.5 py-0.5 font-medium text-[11px] text-muted-foreground leading-none">
              No tools returned.
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
