"use client";

import useSWR, { useSWRConfig } from "swr";
import { OnboardingStepProse } from "@/components/onboarding/onboarding-step-prose";
import { TimezoneSettings } from "@/components/timezone-settings";
import { toast } from "@/components/toast";

async function fetchSettings() {
  const response = await fetch("/api/settings");
  if (!response.ok) {
    throw new Error("Failed to load settings.");
  }
  return response.json();
}

type OnboardingTimezoneStepProps = {
  onRefresh: () => Promise<void>;
};

export function OnboardingTimezoneStep({
  onRefresh,
}: OnboardingTimezoneStepProps) {
  const { mutate: globalMutate } = useSWRConfig();
  const { data, isLoading } = useSWR("onboarding-settings", fetchSettings);

  const handlePersist = async (timezone: string) => {
    const value = timezone.trim() || "UTC";
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: value }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Failed to save timezone");
    }
    await globalMutate("onboarding-settings");
    await globalMutate("settings");
    await onRefresh();
    toast({ type: "success", description: "Timezone saved." });
  };

  return (
    <div className="space-y-6">
      <OnboardingStepProse
        description="Set your local timezone so timestamps and scheduling context are accurate in chat."
        title="Timezone"
      />

      <TimezoneSettings
        disabled={isLoading}
        onPersist={handlePersist}
        showSkeletons={isLoading && !data}
        timezone={data?.timezone ?? "UTC"}
      />
    </div>
  );
}
