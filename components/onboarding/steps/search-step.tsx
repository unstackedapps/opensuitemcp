"use client";

import useSWR, { useSWRConfig } from "swr";
import { WebSearchSettings } from "@/components/web-search-settings";
import type { SearchResourceEntry } from "@/lib/ai/search-resources";
import { postSearchResources } from "@/lib/client/persist-search-resources";

async function fetchSettings() {
  const response = await fetch("/api/settings");
  if (!response.ok) {
    throw new Error("Failed to load settings.");
  }
  return response.json();
}

type OnboardingSearchStepProps = {
  onRefresh: () => Promise<void>;
};

export function OnboardingSearchStep({ onRefresh }: OnboardingSearchStepProps) {
  const { mutate: globalMutate } = useSWRConfig();
  const { data, isLoading } = useSWR("onboarding-settings", fetchSettings);

  const handlePersist = async (next: SearchResourceEntry[]) => {
    await globalMutate(
      "onboarding-settings",
      (current) =>
        current && typeof current === "object"
          ? { ...current, searchResources: next }
          : current,
      { revalidate: false },
    );
    await postSearchResources(next);
    await globalMutate("onboarding-settings");
    await globalMutate("settings");
    await onRefresh();
  };

  return (
    <WebSearchSettings
      disabled={isLoading}
      embedded={{
        title: "Web search",
        description:
          "Add trusted domains the assistant can search for grounded answers. Skip if you do not need web search yet.",
      }}
      managedByOrg={false}
      onPersist={handlePersist}
      resources={data?.searchResources ?? []}
      showSkeletons={isLoading && !data}
    />
  );
}
