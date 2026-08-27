"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { adminSyncOwnerLlmProviderAccess } from "@/app/admin/providers/actions";
import { ProvidersPanel } from "@/components/admin/providers-panel";
import { AiProviderSettings } from "@/components/ai-provider-settings";
import {
  type AiProviderConfig,
  EMPTY_AI_PROVIDER_CONFIG,
  ensureSeededProviderConfig,
  parseAiProviderConfig,
} from "@/lib/ai/provider-entries";
import type { OnboardingMode } from "@/lib/onboarding/types";
import type { OrgLlmProviderRow } from "@/lib/org/llm-providers";

async function fetchSettings() {
  const response = await fetch("/api/settings");
  if (!response.ok) {
    throw new Error("Failed to load settings.");
  }
  return response.json();
}

type OnboardingLlmStepProps = {
  mode: OnboardingMode;
  llmProviders?: OrgLlmProviderRow[];
  actorId?: string;
  onRefresh: () => Promise<void>;
};

function SoloLlmPanel({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const { mutate: globalMutate } = useSWRConfig();
  const { data, isLoading, mutate } = useSWR(
    "onboarding-settings",
    fetchSettings,
  );
  const [aiProviders, setAiProviders] = useState<AiProviderConfig>(
    EMPTY_AI_PROVIDER_CONFIG,
  );

  useEffect(() => {
    if (!data) {
      return;
    }
    setAiProviders(
      ensureSeededProviderConfig(parseAiProviderConfig(data.aiProviders)),
    );
  }, [data]);

  const handlePersist = async (config: AiProviderConfig) => {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiProviders: config }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Failed to save providers.");
    }
    await mutate();
    await globalMutate("settings");
    await onRefresh();
  };

  return (
    <AiProviderSettings
      aiProviders={aiProviders}
      embedded={{
        title: "LLM provider",
        description:
          "Add at least one provider with your own API key (Google Gemini, Anthropic Claude, or OpenAI GPT).",
      }}
      onAiProvidersChange={setAiProviders}
      onPersistProviders={handlePersist}
      showSkeletons={isLoading && !data}
    />
  );
}

function OrgLlmPanel({
  providers,
  actorId,
  onRefresh,
}: {
  providers: OrgLlmProviderRow[];
  actorId?: string;
  onRefresh: () => Promise<void>;
}) {
  const eligibleProviderKey = useMemo(
    () =>
      providers
        .filter((provider) => provider.enabled && provider.hasOrgApiKey)
        .map((provider) => provider.id)
        .sort((a, b) => a.localeCompare(b))
        .join(","),
    [providers],
  );

  useEffect(() => {
    if (!actorId || !eligibleProviderKey) {
      return;
    }

    void (async () => {
      const result = await adminSyncOwnerLlmProviderAccess();
      if (result.ok) {
        await onRefresh();
      }
    })();
  }, [actorId, eligibleProviderKey, onRefresh]);

  return (
    <ProvidersPanel
      embedded={{
        title: "LLM provider",
        description:
          "Add at least one org-wide provider with an API key. You are granted access automatically as the org owner.",
      }}
      providers={providers}
    />
  );
}

export function OnboardingLlmStep({
  mode,
  llmProviders = [],
  actorId,
  onRefresh,
}: OnboardingLlmStepProps) {
  if (mode === "org") {
    return (
      <OrgLlmPanel
        actorId={actorId}
        onRefresh={onRefresh}
        providers={llmProviders}
      />
    );
  }

  return <SoloLlmPanel onRefresh={onRefresh} />;
}
