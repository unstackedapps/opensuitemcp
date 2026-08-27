import { OnboardingStepProse } from "@/components/onboarding/onboarding-step-prose";
import type { OnboardingMode } from "@/lib/onboarding/types";

type OnboardingWelcomeStepProps = {
  mode: OnboardingMode;
};

export function OnboardingWelcomeStep({ mode }: OnboardingWelcomeStepProps) {
  const isOrg = mode === "org";

  return (
    <OnboardingStepProse
      description={
        isOrg
          ? "Connect NetSuite MCP and add an LLM provider to get your team chatting. Everything else in the step nav is optional — skip what you do not need yet."
          : "Connect NetSuite MCP and add an LLM provider to start chatting. The other steps are optional — configure them now or come back later."
      }
      title={isOrg ? "Set up your organization" : "Welcome to OpenSuiteMCP"}
    />
  );
}
