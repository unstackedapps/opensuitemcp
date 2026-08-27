"use client";

import { Globe } from "lucide-react";
import { useId, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SearchResourceEntry } from "@/lib/ai/search-resources";
import { postSearchResources } from "@/lib/client/persist-search-resources";

type SettingsPayload = {
  searchResources?: SearchResourceEntry[];
};

async function fetchSettings(): Promise<SettingsPayload> {
  const response = await fetch("/api/settings");
  if (!response.ok) {
    throw new Error("Failed to load settings");
  }
  return response.json();
}

export function ComposerWebSearchMenu() {
  const { mutate } = useSWRConfig();
  const { data } = useSWR("settings", fetchSettings);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const idPrefix = useId();
  const resources = data?.searchResources ?? [];
  const toggleable = useMemo(
    () => resources.filter((item) => !item.orgDisabled),
    [resources],
  );

  const setEnabled = async (
    resource: SearchResourceEntry,
    enabled: boolean,
  ) => {
    if (resource.orgDisabled || pendingId || resource.enabled === enabled) {
      return;
    }

    const next = resources.map((item) =>
      item.id === resource.id ? { ...item, enabled } : item,
    );
    const previous = data;
    setPendingId(resource.id);
    await mutate(
      "settings",
      previous
        ? { ...previous, searchResources: next }
        : { searchResources: next },
      { revalidate: false },
    );

    try {
      await postSearchResources(next);
      await mutate("settings");
    } catch (error) {
      await mutate("settings", previous, { revalidate: false });
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to save search tools.",
      });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Web Search"
              className="size-8 px-2 focus-visible:ring-0"
              data-testid="composer-web-search"
              type="button"
              variant="ghost"
            >
              <Globe className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Web Search</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        className="min-w-52 max-w-72"
        collisionPadding={12}
        side="top"
      >
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm">Web Search</p>
          <p className="text-muted-foreground text-xs">
            Enable or disable tools for your chats.
          </p>
        </DropdownMenuLabel>
        {data === undefined ? (
          <p className="px-2 py-1.5 text-muted-foreground text-xs">Loading…</p>
        ) : null}
        {data !== undefined && toggleable.length === 0 ? (
          <p className="px-2 py-1.5 text-muted-foreground text-xs">
            No search tools available.
          </p>
        ) : null}
        {data === undefined || toggleable.length === 0
          ? null
          : toggleable.map((resource) => {
              const switchId = `${idPrefix}-${resource.id}`;
              return (
                <div
                  className="flex items-center gap-2 px-2 py-1.5"
                  key={resource.id}
                >
                  <label
                    className="min-w-0 flex-1 truncate text-sm leading-none"
                    htmlFor={switchId}
                  >
                    {resource.label}
                  </label>
                  <Switch
                    checked={resource.enabled}
                    className="h-4 w-7 [&>span]:size-3 [&>span]:data-[state=checked]:translate-x-3"
                    disabled={pendingId !== null}
                    id={switchId}
                    onCheckedChange={(enabled) => {
                      void setEnabled(resource, enabled);
                    }}
                  />
                </div>
              );
            })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
