/**
 * Persona-builder interview helpers (coverage checklist + titles).
 * Shared between client progress UI and server tool gating.
 */

import { PERSONA_BUILDER_ID } from "./ids";
import {
  PERSONA_INTERVIEW_DIMENSIONS,
  type PersonaInterviewDimension,
  type PersonaInterviewState,
} from "./types";

export {
  PERSONA_INTERVIEW_DIMENSIONS,
  type PersonaInterviewDimension,
  type PersonaInterviewState,
} from "./types";

export const PERSONA_INTERVIEW_DIMENSION_LABELS: Record<
  PersonaInterviewDimension,
  string
> = {
  role: "Role / job focus",
  domains: "NetSuite domains",
  tasks: "Typical tasks / success criteria",
  risk: "Risk & write posture",
  approaches: "Preferred approaches",
  tone: "Tone & verbosity",
  constraints: "Hard constraints / never-dos",
};

export function emptyPersonaInterviewState(
  updatedAt = new Date().toISOString(),
): PersonaInterviewState {
  return {
    covered: [],
    missing: [...PERSONA_INTERVIEW_DIMENSIONS],
    updatedAt,
  };
}

function isDimension(value: unknown): value is PersonaInterviewDimension {
  return (
    typeof value === "string" &&
    (PERSONA_INTERVIEW_DIMENSIONS as readonly string[]).includes(value)
  );
}

/** Normalize model/DB coverage into a complete covered/missing split. */
export function normalizePersonaInterviewState(
  value: unknown,
): PersonaInterviewState {
  const coveredSet = new Set<PersonaInterviewDimension>();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const coveredRaw = Array.isArray(record.covered) ? record.covered : [];
    for (const entry of coveredRaw) {
      if (isDimension(entry)) {
        coveredSet.add(entry);
      }
    }
  }

  const covered = PERSONA_INTERVIEW_DIMENSIONS.filter((d) => coveredSet.has(d));
  const missing = PERSONA_INTERVIEW_DIMENSIONS.filter(
    (d) => !coveredSet.has(d),
  );
  const updatedAt =
    value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).updatedAt === "string"
      ? ((value as Record<string, unknown>).updatedAt as string)
      : new Date().toISOString();

  return { covered, missing, updatedAt };
}

export function isPersonaInterviewComplete(
  state: PersonaInterviewState | null | undefined,
): boolean {
  if (!state) {
    return false;
  }
  const normalized = normalizePersonaInterviewState(state);
  return normalized.missing.length === 0;
}

export function mergePersonaInterviewCoverage(
  previous: unknown,
  nextCovered: PersonaInterviewDimension[],
): PersonaInterviewState {
  const base = normalizePersonaInterviewState(previous);
  const coveredSet = new Set(base.covered);
  for (const dim of nextCovered) {
    if (isDimension(dim)) {
      coveredSet.add(dim);
    }
  }
  return normalizePersonaInterviewState({
    covered: [...coveredSet],
    updatedAt: new Date().toISOString(),
  });
}

export function builderChatTitle(input: {
  refiningName?: string | null;
}): string {
  const name = input.refiningName?.trim();
  if (name) {
    return `Refining: ${name}`.slice(0, 60);
  }
  return "Persona interview";
}

export function isBuilderPersonaId(id: string | null | undefined): boolean {
  return (id?.trim() || "") === PERSONA_BUILDER_ID;
}

/** Kickoff after successful Save / conversion. */
export function personaConversionKickoffMessage(name: string): string {
  const label = name.trim() || "your persona";
  return `Persona saved. I'm now ${label}. What should we tackle in NetSuite?`;
}

export function createInterviewOpener(input: {
  mode: "create" | "refine";
  refiningName?: string | null;
}): string {
  if (input.mode === "refine") {
    const name = input.refiningName?.trim() || "your persona";
    return `I'll help you refine **${name}**. I've loaded the current playbook.

We'll cover seven areas (role, domains, tasks, risk/writes, preferred approaches, tone, and hard constraints). Tell me what you want to change first — or say "walk me through everything."`;
  }

  return `I'll help you create a custom NetSuite persona for OpenSuiteMCP.

I'll ask about seven areas: role, NetSuite domains, typical tasks, risk/write posture, preferred approaches (SuiteQL vs UI vs SuiteScript), tone, and hard constraints. You can answer in any order.

What role or job focus should this persona have?`;
}

export type UpdatePersonaInterviewResult = {
  ok: true;
  covered: string[];
  missing: string[];
  complete: boolean;
};

export type ProposeCustomPersonaResult =
  | {
      ok: true;
      name: string;
      shortName: string;
      primaryRole?: string;
      content: string;
    }
  | {
      ok: false;
      error: string;
      missing: string[];
    };
