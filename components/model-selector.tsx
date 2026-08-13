"use client";

import type { Session } from "next-auth";
import { startTransition, useMemo, useOptimistic, useState } from "react";
import useSWR from "swr";
import { saveChatModelAsCookie } from "@/app/(chat)/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { chatModels } from "@/lib/ai/models";
import {
  findProviderById,
  isMultiAiProviders,
  parseAiProviderConfig,
} from "@/lib/ai/provider-entries";
import { cn } from "@/lib/utils";
import { CheckCircleFillIcon, ChevronDownIcon } from "./icons";

async function fetchSettings() {
  const response = await fetch("/api/settings");
  if (!response.ok) {
    return { aiProvider: "google" as const, aiProviders: null };
  }
  const data = await response.json();
  return {
    aiProvider: (data.aiProvider || "google") as
      | "google"
      | "anthropic"
      | "openai",
    aiProviders: data.aiProviders ?? null,
  };
}

export function ModelSelector({
  session,
  selectedModelId,
  className,
}: {
  session: Session;
  selectedModelId: string;
} & React.ComponentProps<typeof Button>) {
  const [open, setOpen] = useState(false);
  const [optimisticModelId, setOptimisticModelId] =
    useOptimistic(selectedModelId);

  // Fetch user's provider setting
  const { data: settings } = useSWR("settings", fetchSettings, {
    fallbackData: { aiProvider: "google" as const, aiProviders: null },
  });

  const userType = session.user.type;
  const { availableChatModelIds } = entitlementsByUserType[userType];
  const providerConfig = parseAiProviderConfig(settings?.aiProviders);
  const activeEntry = isMultiAiProviders(providerConfig)
    ? (findProviderById(providerConfig, providerConfig.defaultId) ??
      providerConfig.providers[0])
    : undefined;
  const providerType = activeEntry?.type || settings?.aiProvider || "google";

  // Filter models by both entitlements AND provider
  const availableChatModels =
    providerType === "custom" && activeEntry
      ? [
          {
            id: "chat-model",
            name: activeEntry.speedModelId || "Speed",
            description: "Speed mode — custom endpoint",
            provider: undefined,
          },
          {
            id: "chat-model-reasoning",
            name: activeEntry.reasoningModelId || "Reasoning",
            description: "Reasoning mode — custom endpoint",
            provider: undefined,
          },
        ].filter((chatModel) => availableChatModelIds.includes(chatModel.id))
      : chatModels.filter((chatModel) => {
          const matchesEntitlements = availableChatModelIds.includes(
            chatModel.id,
          );
          const matchesProvider =
            !chatModel.provider || chatModel.provider === providerType;
          return matchesEntitlements && matchesProvider;
        });

  const selectedChatModel = useMemo(
    () =>
      availableChatModels.find(
        (chatModel) => chatModel.id === optimisticModelId,
      ),
    [optimisticModelId, availableChatModels],
  );

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger
        asChild
        className={cn(
          "w-fit data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
          className,
        )}
      >
        <Button
          className="md:h-[34px] md:px-2"
          data-testid="model-selector"
          variant="outline"
        >
          {selectedChatModel?.name}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[280px] max-w-[90vw] sm:min-w-[300px]"
      >
        {availableChatModels.map((chatModel) => {
          const { id } = chatModel;

          return (
            <DropdownMenuItem
              asChild
              data-active={id === optimisticModelId}
              data-testid={`model-selector-item-${id}`}
              key={id}
              onSelect={() => {
                setOpen(false);

                startTransition(() => {
                  setOptimisticModelId(id);
                  saveChatModelAsCookie(id);
                });
              }}
            >
              <button
                className="group/item flex w-full flex-row items-center justify-between gap-2 sm:gap-4"
                type="button"
              >
                <div className="flex flex-col items-start gap-1">
                  <div className="text-sm sm:text-base">{chatModel.name}</div>
                  <div className="line-clamp-2 text-muted-foreground text-xs">
                    {chatModel.description}
                  </div>
                </div>

                <div className="shrink-0 text-foreground opacity-0 group-data-[active=true]/item:opacity-100 dark:text-foreground">
                  <CheckCircleFillIcon />
                </div>
              </button>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
