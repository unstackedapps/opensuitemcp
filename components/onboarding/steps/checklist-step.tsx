"use client";

import type {
  OnboardingChecklistItem,
  OnboardingMode,
  OnboardingStepStatus,
} from "@/lib/onboarding/types";

type OnboardingChecklistStepProps = {
  steps: OnboardingStepStatus[];
  checklist: OnboardingChecklistItem[];
  canComplete: boolean;
  mode: OnboardingMode;
};

export function OnboardingChecklistStep({
  steps,
  checklist,
  canComplete,
  mode,
}: OnboardingChecklistStepProps) {
  const setupSteps = steps.filter(
    (step) => step.id !== "welcome" && step.id !== "checklist",
  );

  const incompleteRequired = setupSteps.filter(
    (step) => step.required && !step.complete,
  );

  const skippedOptional = canComplete
    ? [
        ...new Set([
          ...setupSteps
            .filter(
              (step) => !step.required && !step.complete && step.id !== "gates",
            )
            .map((step) => step.label),
          ...(mode === "org"
            ? checklist
                .filter((item) => !item.complete && item.id !== "invite-team")
                .map((item) => item.label)
            : []),
        ]),
      ]
    : [];

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="font-semibold text-base leading-snug md:text-lg">
          {canComplete ? "You're all set!" : "Almost there!"}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {canComplete
            ? "Required setup is complete. Open the app when you're ready."
            : "Complete the required items below, then return here to finish."}
        </p>
      </header>

      {canComplete ? (
        <>
          {skippedOptional.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm">
                You skipped these optional items — you can set them up anytime:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground text-sm">
                {skippedOptional.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-muted-foreground text-sm leading-relaxed">
            {mode === "org"
              ? "You can change org settings, users, and integrations anytime in the admin area."
              : "You can change personas, skills, search, and other settings anytime in the app."}
          </p>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">Still required:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {incompleteRequired.map((step) => (
              <li key={step.id}>{step.label}</li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Use the step nav above to go back and complete them.
          </p>
        </div>
      )}
    </div>
  );
}
