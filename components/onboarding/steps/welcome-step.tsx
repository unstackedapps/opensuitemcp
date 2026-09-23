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
          : "Two things and you can start chatting: a NetSuite MCP connection and an LLM provider. Personas, skills, web search, agent access and timezone are all set in the app afterwards."
      }
      title={isOrg ? "Set up your organization" : "Welcome to OpenSuiteMCP"}
    />
  );
}
