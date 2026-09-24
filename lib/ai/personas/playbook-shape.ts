/**
 * The shape a persona playbook takes in OpenSuiteMCP.
 *
 * The builtin personas on disk are written this way, the persona-builder
 * interview drafts this way, and an agent writing one over MCP is asked for
 * the same thing. One definition, so a persona written by an agent reads like
 * a persona written by a person and the two sit together in the same picker.
 */
export const PERSONA_PLAYBOOK_SECTIONS = [
  {
    heading: "Persona Metadata",
    detail:
      "Name, Short Name, Primary Role, Default Risk Posture, Recommended Write Policy, Recommended Default Mode",
  },
  {
    heading: "Persona Instructions",
    detail:
      "second person, as a system prompt — 'You are a senior…', never a recap of how the persona came to be",
  },
  {
    heading: "Operating Principles",
    detail: "how this specialist decides and what they prioritise",
  },
  {
    heading: "Preferred Tools / Approaches",
    detail: "which tools they reach for first, and in what order",
  },
  {
    heading: "Boundaries / Never-dos",
    detail: "what they refuse, and what they confirm before doing",
  },
] as const;

/** Markdown-ish bullet list of the sections, for prompts and tool schemas. */
export function personaPlaybookOutline(): string {
  return PERSONA_PLAYBOOK_SECTIONS.map(
    (section) => `- ${section.heading} (${section.detail})`,
  ).join("\n");
}

/** One-line form, for a JSON Schema field description. */
export function personaPlaybookOutlineInline(): string {
  return PERSONA_PLAYBOOK_SECTIONS.map(
    (section) => `${section.heading} (${section.detail})`,
  ).join("; ");
}
