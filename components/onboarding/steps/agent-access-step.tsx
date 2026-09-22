"use client";

import { McpAccessPanel } from "@/components/mcp-access-settings";
import { OnboardingStepProse } from "@/components/onboarding/onboarding-step-prose";

/**
 * Agent access during onboarding.
 *
 * The same panel the App Portal shows, so a key minted here is the key the
 * user manages later. It reports its own state when the feature is switched
 * off for the install or the organization, which is why this step is shown
 * either way: a self-hosted operator who has not set the flag still learns the
 * capability exists and what to turn on.
 */
export function OnboardingAgentAccessStep() {
  return (
    <div className="space-y-4">
      <OnboardingStepProse
        title="Agent access"
        description="Let an external AI agent work in this workspace as you. It reaches exactly what you have enabled — nothing more. Optional."
      />
      <div className="overflow-hidden rounded-md border border-border/60">
        <McpAccessPanel active />
      </div>
    </div>
  );
}
