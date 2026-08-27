"use client";

import type { ComponentProps } from "react";
import { OnboardingWizard } from "./onboarding-wizard";

export function OnboardingWizardLoader(
  props: ComponentProps<typeof OnboardingWizard>,
) {
  return <OnboardingWizard {...props} />;
}
