/** Shared persona types (no Node / server-only). */

export type PersonaSource = "ava" | "builtin" | "custom" | "system";

export type CustomPersona = {
  id: string;
  name: string;
  shortName: string;
  primaryRole?: string;
  content: string;
  updatedAt: string;
};

/** Dimensions the persona-builder interview must cover before propose. */
export const PERSONA_INTERVIEW_DIMENSIONS = [
  "role",
  "domains",
  "tasks",
  "risk",
  "approaches",
  "tone",
  "constraints",
] as const;

export type PersonaInterviewDimension =
  (typeof PERSONA_INTERVIEW_DIMENSIONS)[number];

export type PersonaInterviewState = {
  covered: PersonaInterviewDimension[];
  missing: PersonaInterviewDimension[];
  updatedAt: string;
};
