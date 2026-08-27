"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import useSWR from "swr";
import {
  completeOnboardingAction,
  markOnboardingStepViewedAction,
} from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import type { OrgRole } from "@/lib/db/schema";
import type {
  OnboardingReadiness,
  OnboardingStepId,
} from "@/lib/onboarding/types";
import { getOnboardingStepOrder } from "@/lib/onboarding/types";
import type { AdminOrgPersonaRow } from "@/lib/org/admin/personas";
import type { AdminOrgSkillRow } from "@/lib/org/admin/skills";
import type { OrgUserTagRow } from "@/lib/org/admin/user-tags";
import type { OrgUserRow } from "@/lib/org/admin/users";
import type { OrgConnectedSkillSourceRow } from "@/lib/org/connected-skills";
import type { OrgLlmProviderRow } from "@/lib/org/llm-providers";
import type { OrgNetSuiteMcpAccountRow } from "@/lib/org/netsuite-mcp-accounts";
import type { OrgOidcAccountRow } from "@/lib/org/oidc-accounts";
import type { OrgSearchResourceRow } from "@/lib/org/search-resources";
import { OnboardingStepNav } from "./onboarding-step-nav";
import { OnboardingChecklistStep } from "./steps/checklist-step";
import { OnboardingConnectedSkillsStep } from "./steps/connected-skills-step";
import { OnboardingCustomSkillsStep } from "./steps/custom-skills-step";
import { OnboardingGatesStep } from "./steps/gates-step";
import { OnboardingLlmStep } from "./steps/llm-step";
import { OnboardingMcpStep } from "./steps/mcp-step";
import { OnboardingOidcExtraStep } from "./steps/oidc-extra-step";
import { OnboardingOidcStep } from "./steps/oidc-step";
import { OnboardingPersonaStep } from "./steps/persona-step";
import { OnboardingSearchStep } from "./steps/search-step";
import { OnboardingTimezoneStep } from "./steps/timezone-step";
import { OnboardingUsersStep } from "./steps/users-step";
import { OnboardingWelcomeStep } from "./steps/welcome-step";

async function fetchReadiness(): Promise<OnboardingReadiness> {
  const response = await fetch("/api/onboarding/readiness");
  if (!response.ok) {
    throw new Error("Failed to load onboarding status.");
  }
  const data = await response.json();
  if (data.completed) {
    window.location.href = "/";
    throw new Error("Onboarding already complete.");
  }
  return data as OnboardingReadiness;
}

type OnboardingWizardProps = {
  initialReadiness: OnboardingReadiness;
  actorId?: string;
  actorRole?: OrgRole;
  oidcAccounts?: OrgOidcAccountRow[];
  mcpAccounts?: OrgNetSuiteMcpAccountRow[];
  llmProviders?: OrgLlmProviderRow[];
  users?: OrgUserRow[];
  orgTags?: OrgUserTagRow[];
  orgSkills?: AdminOrgSkillRow[];
  connectedSkillSources?: OrgConnectedSkillSourceRow[];
  orgPersonas?: AdminOrgPersonaRow[];
  searchResources?: OrgSearchResourceRow[];
  connectedMcpAccountIds?: string[];
};

export function OnboardingWizard({
  initialReadiness,
  actorId,
  actorRole,
  oidcAccounts = [],
  mcpAccounts = [],
  llmProviders = [],
  users = [],
  orgTags = [],
  orgSkills = [],
  connectedSkillSources = [],
  orgPersonas = [],
  searchResources = [],
  connectedMcpAccountIds = [],
}: OnboardingWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const stepOrder = useMemo(
    () => getOnboardingStepOrder(initialReadiness.mode),
    [initialReadiness.mode],
  );

  const requestedStep = searchParams.get("step") as OnboardingStepId | null;
  const initialStep =
    requestedStep && stepOrder.includes(requestedStep)
      ? requestedStep
      : stepOrder[0];

  const [currentStep, setCurrentStep] = useState<OnboardingStepId>(initialStep);

  const { data: readiness, mutate } = useSWR(
    "onboarding-readiness",
    fetchReadiness,
    {
      fallbackData: initialReadiness,
      revalidateOnFocus: true,
    },
  );

  const currentIndex = stepOrder.indexOf(currentStep);
  const progress =
    stepOrder.length > 1
      ? Math.round(((currentIndex + 1) / stepOrder.length) * 100)
      : 100;

  const goToStep = useCallback(
    (step: OnboardingStepId) => {
      setCurrentStep(step);
      const url = new URL(window.location.href);
      url.searchParams.set("step", step);
      url.searchParams.delete("netsuite_connected");
      url.searchParams.delete("error");
      url.searchParams.delete("error_description");
      router.replace(`${url.pathname}?${url.searchParams.toString()}`);
    },
    [router],
  );

  useEffect(() => {
    if (searchParams.get("netsuite_connected") === "true") {
      void mutate();
    }
  }, [searchParams, mutate]);

  useEffect(() => {
    void markOnboardingStepViewedAction(currentStep).then((result) => {
      if (!result.ok || !result.viewedSteps) {
        return;
      }
      void mutate(
        (current) =>
          current
            ? {
                ...current,
                steps: current.steps.map((step) => ({
                  ...step,
                  viewed: result.viewedSteps?.includes(step.id) ?? step.viewed,
                })),
              }
            : current,
        { revalidate: false },
      );
    });
  }, [currentStep, mutate]);

  const refreshReadiness = useCallback(async () => {
    await mutate();
    router.refresh();
  }, [mutate, router]);

  const goNext = () => {
    const next = stepOrder[currentIndex + 1];
    if (next) {
      goToStep(next);
    }
  };

  const goBack = () => {
    const previous = stepOrder[currentIndex - 1];
    if (previous) {
      goToStep(previous);
    }
  };

  const handleComplete = () => {
    startTransition(async () => {
      await completeOnboardingAction();
    });
  };

  if (!readiness) {
    return null;
  }

  const currentStepMeta = readiness.steps.find(
    (step) => step.id === currentStep,
  );
  const isLastStep = currentStep === "checklist";
  const canContinue = currentStepMeta?.complete === true;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <OnboardingStepNav
        currentIndex={currentIndex}
        currentStep={currentStep}
        progress={progress}
        steps={readiness.steps}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        <section className="min-h-0 flex-1 overflow-y-scroll rounded-md border border-border/60 p-4 [scrollbar-gutter:stable] md:p-6">
          {currentStep === "welcome" ? (
            <OnboardingWelcomeStep mode={readiness.mode} />
          ) : null}
          {currentStep === "oidc" && readiness.mode === "org" ? (
            <OnboardingOidcStep oidcAccounts={oidcAccounts} />
          ) : null}
          {currentStep === "mcp" ? (
            <OnboardingMcpStep
              actorId={actorId}
              connectedMcpAccountIds={connectedMcpAccountIds}
              mcpAccounts={mcpAccounts}
              mode={readiness.mode}
              onRefresh={refreshReadiness}
            />
          ) : null}
          {currentStep === "oidc-extra" && readiness.mode === "solo" ? (
            <OnboardingOidcExtraStep />
          ) : null}
          {currentStep === "llm" ? (
            <OnboardingLlmStep
              actorId={actorId}
              llmProviders={llmProviders}
              mode={readiness.mode}
              onRefresh={refreshReadiness}
            />
          ) : null}
          {currentStep === "persona" && readiness.mode === "solo" ? (
            <OnboardingPersonaStep onRefresh={refreshReadiness} />
          ) : null}
          {currentStep === "connected-skills" && readiness.mode === "solo" ? (
            <OnboardingConnectedSkillsStep onRefresh={refreshReadiness} />
          ) : null}
          {currentStep === "custom-skills" && readiness.mode === "solo" ? (
            <OnboardingCustomSkillsStep onRefresh={refreshReadiness} />
          ) : null}
          {currentStep === "search" && readiness.mode === "solo" ? (
            <OnboardingSearchStep onRefresh={refreshReadiness} />
          ) : null}
          {currentStep === "timezone" && readiness.mode === "solo" ? (
            <OnboardingTimezoneStep onRefresh={refreshReadiness} />
          ) : null}
          {currentStep === "users" && actorId && actorRole ? (
            <OnboardingUsersStep
              actorId={actorId}
              actorRole={actorRole}
              llmProviders={llmProviders}
              netsuiteMcpAccounts={mcpAccounts}
              oidcAccounts={oidcAccounts}
              orgPersonas={orgPersonas}
              orgTags={orgTags}
              users={users}
            />
          ) : null}
          {currentStep === "gates" ? (
            <OnboardingGatesStep
              connectedSources={connectedSkillSources}
              onRefresh={refreshReadiness}
              orgPersonas={orgPersonas}
              orgSkills={orgSkills}
              searchResources={searchResources}
            />
          ) : null}
          {currentStep === "checklist" ? (
            <OnboardingChecklistStep
              canComplete={readiness.canComplete}
              checklist={readiness.checklist}
              mode={readiness.mode}
              steps={readiness.steps}
            />
          ) : null}
        </section>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            className="h-8 text-sm"
            disabled={currentIndex === 0 || isPending}
            onClick={goBack}
            type="button"
            variant="outline"
          >
            <ChevronLeft className="mr-1 size-4" />
            Back
          </Button>

          <div className="flex flex-col gap-2 sm:flex-row">
            {currentStepMeta?.optional ? (
              <Button
                className="h-8 text-sm"
                disabled={isPending}
                onClick={goNext}
                type="button"
                variant="ghost"
              >
                Skip for now
              </Button>
            ) : null}

            {isLastStep ? (
              <Button
                className="h-8 text-sm"
                disabled={!readiness.canComplete || isPending}
                onClick={handleComplete}
                type="button"
              >
                {isPending ? "Finishing…" : "Finish setup"}
              </Button>
            ) : (
              <Button
                className="h-8 text-sm"
                disabled={!canContinue || isPending}
                onClick={goNext}
                type="button"
              >
                Continue
                <ChevronRight className="ml-1 size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
