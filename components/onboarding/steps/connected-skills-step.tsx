"use client";

import { OnboardingStepProse } from "@/components/onboarding/onboarding-step-prose";
import { SkillsPanel } from "@/components/skills-modal";

type OnboardingConnectedSkillsStepProps = {
  onRefresh: () => Promise<void>;
};

export function OnboardingConnectedSkillsStep({
  onRefresh,
}: OnboardingConnectedSkillsStepProps) {
  return (
    <div className="space-y-6">
      <OnboardingStepProse
        description="Link a public GitHub skills pack to use slash commands in chat. Connected skills are invoked with / in the composer."
        title="Connected skills"
      />

      <SkillsPanel
        active
        embedded
        onSettingsChange={onRefresh}
        sections={["connected"]}
      />
    </div>
  );
}
