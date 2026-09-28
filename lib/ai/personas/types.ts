/** Shared persona types (no Node / server-only). */

export type PersonaSource = "ava" | "builtin" | "custom" | "system";

export type CustomPersona = {
  id: string;
  name: string;
  shortName: string;
  primaryRole?: string;
  content: string;
  updatedAt: string;
  /**
   * Stamped when a connected agent wrote this persona over MCP. Absent means a
   * person wrote it. Agents and people share one library — an agent can adopt
   * a persona you wrote, and you can pick one it wrote — so the picker needs a
   * way to say which is which.
   */
  authoredBy?: "agent";
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
