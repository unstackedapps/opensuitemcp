export type OnboardingMode = "solo" | "org";

export type OnboardingStepId =
  | "welcome"
  | "oidc"
  | "mcp"
  | "oidc-extra"
  | "llm"
  | "persona"
  | "connected-skills"
  | "custom-skills"
  | "search"
  | "timezone"
  | "users"
  | "gates"
  | "checklist";

export type OnboardingStepStatus = {
  id: OnboardingStepId;
  label: string;
  description: string;
  required: boolean;
  complete: boolean;
  viewed?: boolean;
  optional?: boolean;
};

export type OnboardingChecklistItem = {
  id: string;
  label: string;
  description: string;
  complete: boolean;
  optional?: boolean;
  href?: string;
  portalSection?: string;
};

export type OnboardingReadiness = {
  mode: OnboardingMode;
  completed: boolean;
  steps: OnboardingStepStatus[];
  checklist: OnboardingChecklistItem[];
  canComplete: boolean;
  envOidcConfigured: boolean;
};

export const SOLO_STEP_ORDER: OnboardingStepId[] = [
  "welcome",
  "mcp",
  "oidc-extra",
  "llm",
  "persona",
  "connected-skills",
  "custom-skills",
  "search",
  "timezone",
  "checklist",
];

export const ORG_STEP_ORDER: OnboardingStepId[] = [
  "welcome",
  "oidc",
  "mcp",
  "llm",
  "users",
  "gates",
  "checklist",
];

export function getOnboardingStepOrder(
  mode: OnboardingMode,
): OnboardingStepId[] {
  return mode === "org" ? ORG_STEP_ORDER : SOLO_STEP_ORDER;
}
