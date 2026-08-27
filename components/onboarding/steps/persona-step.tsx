"use client";

import { OnboardingStepProse } from "@/components/onboarding/onboarding-step-prose";
import { PersonasPanel } from "@/components/personas-panel";

type OnboardingPersonaStepProps = {
  onRefresh: () => Promise<void>;
};

export function OnboardingPersonaStep({
  onRefresh,
}: OnboardingPersonaStepProps) {
  return (
    <div className="space-y-6">
      <OnboardingStepProse
        description="Choose a default built-in specialist for new chats. You can create custom personas later from chat or the App Portal."
        title="Default persona"
      />

      <PersonasPanel active embedded onSettingsChange={onRefresh} />
    </div>
  );
}
