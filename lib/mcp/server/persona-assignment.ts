import { resolvePersona } from "@/lib/ai/personas/catalog";
import type { CustomPersona } from "@/lib/ai/personas/types";

export type AssignedPersona = {
  id: string;
  name: string;
  shortName: string;
  primaryRole: string;
  source: "ava" | "builtin" | "custom" | "system";
};

/**
 * The persona an agent key is actually acting as.
 *
 * Every key has one. A key with no assignment, and a key whose persona was
 * deleted after it was minted, both land on Ava — she ships with the install
 * and cannot be removed, so there is no state where an agent has been handed a
 * role that does not exist. Assigning a new persona is what moves it off her.
 */
export function resolveAssignedPersona(
  personaId: string | null | undefined,
  customPersonas: CustomPersona[] | null | undefined,
): AssignedPersona {
  const resolved = resolvePersona({
    personaId,
    customPersonas: customPersonas ?? [],
  });
  return {
    id: resolved.id,
    name: resolved.name,
    shortName: resolved.shortName,
    primaryRole: resolved.primaryRole,
    source: resolved.source,
  };
}
