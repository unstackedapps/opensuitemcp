"use client";

import { SkillsPanel } from "@/components/skills-modal";

type OnboardingCustomSkillsStepProps = {
  onRefresh: () => Promise<void>;
};

export function OnboardingCustomSkillsStep({
  onRefresh,
}: OnboardingCustomSkillsStepProps) {
  return (
    <SkillsPanel
      active
      embedded={{
        title: "Custom skills",
        description:
          "Add your own SKILL.md instructions for workflows you repeat often. Custom skills apply to your chats only.",
      }}
      onSettingsChange={onRefresh}
      sections={["custom"]}
    />
  );
}
