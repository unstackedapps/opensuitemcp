"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type AiProviderConfig,
  findProviderById,
  isMultiAiProviders,
  parseAiProviderConfig,
  providerTypeLabel,
} from "@/lib/ai/provider-entries";
import { CheckCircleFillIcon, ChevronDownIcon } from "./icons";
import { toast } from "./toast";

type SettingsPayload = {
  aiProvider?: "google" | "anthropic" | "openai";
  aiProviders?: AiProviderConfig;
};

async function fetchSettings(): Promise<SettingsPayload> {
  const response = await fetch("/api/settings");
  if (!response.ok) {
    return {
      aiProvider: "google",
      aiProviders: { defaultId: null, providers: [] },
    };
  }
  return response.json();
}

export function AiProviderSwitcher({
  chatId,
  aiProviderId,
  onAiProviderChange,
}: {
  chatId: string;
  aiProviderId: string | null;
  onAiProviderChange?: (id: string | null) => void;
}) {
  const { data: settings } = useSWR("settings", fetchSettings);
  const config = parseAiProviderConfig(settings?.aiProviders);
  const multi = isMultiAiProviders(config);
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => {
    if (aiProviderId) {
      return (
        findProviderById(config, aiProviderId) ??
        findProviderById(config, config.defaultId)
      );
    }
    return findProviderById(config, config.defaultId) ?? config.providers[0];
  }, [aiProviderId, config]);

  if (!multi) {
    return null;
  }

  const handleSelect = async (id: string) => {
    setOpen(false);
    onAiProviderChange?.(id);
    try {
      const response = await fetch(`/api/chat/${chatId}/ai-provider`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiProviderId: id }),
      });
      if (!response.ok && response.status !== 404) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to switch provider");
      }
      const entry = findProviderById(config, id);
      toast({
        type: "success",
        description: `Using ${entry?.label ?? "provider"}`,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Failed to switch")
      ) {
        toast({ type: "error", description: error.message });
      }
    }
  };

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button className="h-8 px-2" type="button" variant="ghost">
          <span className="max-w-[140px] truncate font-medium text-xs">
            {selected?.label ?? "AI Provider"}
          </span>
          <ChevronDownIcon size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        {config.providers.map((entry) => (
          <DropdownMenuItem
            key={entry.id}
            onSelect={() => {
              void handleSelect(entry.id);
            }}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm">{entry.label}</p>
                <p className="text-muted-foreground text-xs">
                  {providerTypeLabel(entry.type)}
                </p>
              </div>
              {entry.id === selected?.id ? <CheckCircleFillIcon /> : null}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
