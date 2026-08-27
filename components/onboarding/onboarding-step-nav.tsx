"use client";

import { Check } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type {
  OnboardingStepId,
  OnboardingStepStatus,
} from "@/lib/onboarding/types";
import { cn } from "@/lib/utils";

const stepCompleteIndicatorClass =
  "bg-green-600/12 text-green-700 dark:bg-green-900/45 dark:text-green-600";

const stepViewedIndicatorClass = "bg-muted-foreground/15 text-muted-foreground";

type OnboardingStepNavProps = {
  steps: OnboardingStepStatus[];
  currentStep: OnboardingStepId;
  currentIndex: number;
  progress: number;
};

export function OnboardingStepNav({
  steps,
  currentStep,
  currentIndex,
  progress,
}: OnboardingStepNavProps) {
  return (
    <nav
      aria-label="Setup steps"
      className="shrink-0 space-y-3 border-border/60 border-b pb-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium text-foreground text-xs">
          Step {currentIndex + 1} of {steps.length}
        </p>
        <p className="text-muted-foreground text-[11px]">{progress}%</p>
      </div>
      <Progress className="h-1" value={progress} />

      <ol className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-gutter:stable]">
        {steps.map((step, index) => {
          const active = step.id === currentStep;
          const done = step.complete && step.id !== "checklist";
          const viewed = Boolean(step.viewed) && !done;

          return (
            <li
              aria-current={active ? "step" : undefined}
              className="shrink-0"
              key={step.id}
            >
              <div
                className={cn(
                  "grid max-w-48 min-w-30 grid-cols-[auto_minmax(0,1fr)] gap-x-2 rounded-md px-2.5 py-2 text-left sm:max-w-none sm:min-w-0",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "row-start-1 flex size-5 shrink-0 items-center justify-center self-center rounded-full text-[10px]",
                    active
                      ? "bg-foreground text-background"
                      : done
                        ? stepCompleteIndicatorClass
                        : viewed
                          ? stepViewedIndicatorClass
                          : "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? (
                    <Check className="size-3" />
                  ) : viewed ? (
                    <span className="size-1.5 rounded-full bg-current" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="row-start-1 min-w-0 self-center text-xs leading-snug sm:whitespace-nowrap">
                  {step.label}
                </span>
                {active && step.optional ? (
                  <span className="col-start-2 row-start-2 text-[10px] text-muted-foreground leading-tight">
                    Optional
                  </span>
                ) : active && step.required ? (
                  <span className="col-start-2 row-start-2 text-[10px] text-muted-foreground leading-tight">
                    Required
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
