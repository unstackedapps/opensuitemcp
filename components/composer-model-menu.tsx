"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { saveChatModelAsCookie } from "@/app/(chat)/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { REGISTERED_MODELS } from "@/lib/ai/model-registry";
import {
  type AiProviderConfig,
  type AiProviderEntry,
  entryUsesModelOverrides,
  findProviderById,
  findUsableChatProvider,
  type HostedAiProviderType,
  isHostedAiProviderType,
  isMultiAiProviders,
  isProviderEntryConfigured,
  parseAiProviderConfig,
  providerSelectorSubtitle,
  providerTypeLabel,
} from "@/lib/ai/provider-entries";
import {
  BrainIcon,
  CheckCircleFillIcon,
  ChevronDownIcon,
  StopwatchFastIcon,
} from "./icons";
import { toast } from "./toast";

type SettingsPayload = {
  aiProvider?: HostedAiProviderType;
  aiProviders?: AiProviderConfig;
};

type SlotOption = {
  id: "chat-model" | "chat-model-reasoning";
  slotLabel: string;
  name: string;
  description: string;
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

function fallbackHostedType(value: string | undefined): HostedAiProviderType {
  if (value && isHostedAiProviderType(value)) {
    return value;
  }
  return "google";
}

function slotOptionsFor(
  entry: AiProviderEntry | undefined,
  fallbackType: HostedAiProviderType,
): SlotOption[] {
  if (entry && entryUsesModelOverrides(entry)) {
    return [
      {
        id: "chat-model",
        slotLabel: "Speed",
        name: entry.speedModelId?.trim() || "Speed",
        description: "Faster replies for everyday NetSuite tasks.",
      },
      {
        id: "chat-model-reasoning",
        slotLabel: "Reasoning",
        name: entry.reasoningModelId?.trim() || "Reasoning",
        description:
          "More thorough replies; slower and uses more of your limits.",
      },
    ];
  }

  const type =
    entry?.type && entry.type !== "custom" ? entry.type : fallbackType;

  return REGISTERED_MODELS.filter((model) => model.provider === type).map(
    (model) => ({
      id:
        model.slot === "speed"
          ? ("chat-model" as const)
          : ("chat-model-reasoning" as const),
      slotLabel: model.slot === "speed" ? "Speed" : "Reasoning",
      name: model.name,
      description: model.blurb,
    }),
  );
}

export function ComposerModelMenu({
  chatId,
  aiProviderId,
  onAiProviderChange,
  selectedModelId,
  onModelChange,
}: {
  chatId: string;
  aiProviderId: string | null;
  onAiProviderChange?: (id: string | null) => void;
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
}) {
  const { mutate } = useSWRConfig();
  const { data: settings } = useSWR("settings", fetchSettings);
  const [open, setOpen] = useState(false);
  const [optimisticModelId, setOptimisticModelId] = useState(selectedModelId);

  useEffect(() => {
    setOptimisticModelId(selectedModelId);
  }, [selectedModelId]);

  const config = useMemo(
    () => parseAiProviderConfig(settings?.aiProviders),
    [settings?.aiProviders],
  );
  const hostedType = fallbackHostedType(settings?.aiProvider);
  const selectedEntry = isMultiAiProviders(config)
    ? findUsableChatProvider(config, aiProviderId)
    : undefined;
  const options = slotOptionsFor(selectedEntry, hostedType);
  const currentOption =
    options.find((option) => option.id === optimisticModelId) ?? options[0];
  const providerLabel = selectedEntry?.label ?? providerTypeLabel(hostedType);
  const otherProviders = config.providers.filter(
    (entry) =>
      isProviderEntryConfigured(entry) && entry.id !== selectedEntry?.id,
  );

  const handleModelChange = (newModelId: string) => {
    const option = options.find((item) => item.id === newModelId);
    toast({
      type: "success",
      description: `Switched to ${option?.name ?? newModelId}`,
    });
    setOptimisticModelId(newModelId);
    onModelChange?.(newModelId);
    startTransition(() => {
      saveChatModelAsCookie(newModelId);
    });
  };

  const handleProviderChange = async (id: string) => {
    setOpen(false);
    if (id === selectedEntry?.id) {
      return;
    }
    onAiProviderChange?.(id);
    try {
      const response = await fetch(`/api/chat/${chatId}/ai-provider`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiProviderId: id }),
      });
      if (!response.ok && response.status !== 404) {
        const error = await response.json().catch(() => ({ error: "" }));
        throw new Error(error.error || "Failed to switch provider");
      }
      const entry = findProviderById(config, id);
      await mutate("settings");
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
        <Button
          aria-label={`${providerLabel}, ${currentOption?.name ?? "model"}`}
          className="h-8 px-2"
          data-testid="model-selector"
          type="button"
          variant="ghost"
        >
          <span className="max-w-48 truncate font-medium text-xs sm:max-w-56">
            {providerLabel}
            {currentOption ? ` · ${currentOption.name}` : ""}
          </span>
          <ChevronDownIcon size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-56"
        collisionPadding={12}
        side="top"
      >
        <DropdownMenuLabel className="flex items-start justify-between gap-3 font-normal">
          <div className="min-w-0">
            <p className="truncate text-sm">{providerLabel}</p>
            <p className="text-muted-foreground text-xs">
              {currentOption?.name ?? providerTypeLabel(hostedType)}
            </p>
          </div>
          <CheckCircleFillIcon />
        </DropdownMenuLabel>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-testid="model-selector-mode">
            Mode
            <span className="ml-auto text-muted-foreground text-xs">
              {currentOption?.slotLabel}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-52">
            <p className="px-2 py-1.5 text-muted-foreground text-xs leading-snug">
              Reasoning is more thorough, but slower and uses your provider
              limits faster.
            </p>
            {options.map((option) => {
              const selected = option.id === currentOption?.id;
              return (
                <DropdownMenuItem
                  data-testid={`model-selector-item-${option.id}`}
                  key={option.id}
                  onSelect={() => {
                    handleModelChange(option.id);
                  }}
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      {option.id === "chat-model-reasoning" ? (
                        <BrainIcon size={16} />
                      ) : (
                        <StopwatchFastIcon size={16} />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm">{option.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {option.description}
                        </p>
                      </div>
                    </div>
                    {selected ? <CheckCircleFillIcon /> : null}
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {otherProviders.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>More providers</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-52">
                {otherProviders.map((entry) => (
                  <DropdownMenuItem
                    key={entry.id}
                    onSelect={() => {
                      handleProviderChange(entry.id);
                    }}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{entry.label}</p>
                        <p className="text-muted-foreground text-xs">
                          {providerSelectorSubtitle(entry, config.providers)}
                        </p>
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
