/**
 * Validation for a custom skill an agent writes over MCP.
 *
 * Pure on purpose: the MCP tools that use it need `server-only` and a
 * database, so the rules themselves live here where they can be tested.
 * Caps match the ones the Skills modal saves under.
 */

import { isOrgManagedCustomSkillId } from "./ids";

export const MAX_CUSTOM_SKILLS = 32;
export const MAX_CUSTOM_SKILL_CONTENT = 32_000;
export const MAX_CUSTOM_SKILL_NAME = 200;

/** Modes an agent may write. `off` is the person's call, not the agent's. */
export type AgentSkillMode = "auto" | "slash";

export type SkillDraft = {
  name: string;
  content: string;
  mode: AgentSkillMode;
};

export type SkillDraftResult =
  | { ok: true; draft: SkillDraft }
  | { ok: false; error: string };

function readTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * `slash` is the default, and the reason is the two surfaces this library
 * feeds. A custom skill resolves to `auto` unless told otherwise, and `auto`
 * means every chat turn in the OpenSuiteMCP UI carries it. A skill an agent
 * wrote while researching one task does not belong on top of every unrelated
 * prompt its owner types, so it is written invocable by name and paired to the
 * persona that needs it.
 */
export function readAgentSkillMode(value: unknown): AgentSkillMode {
  return value === "auto" ? "auto" : "slash";
}

export function readSkillDraft(args: {
  name: unknown;
  content: unknown;
  mode: unknown;
}): SkillDraftResult {
  const name = readTrimmed(args.name);
  const content = readTrimmed(args.content);

  if (!name) {
    return { ok: false, error: "Pass a `name` for the skill." };
  }
  if (name.length > MAX_CUSTOM_SKILL_NAME) {
    return {
      ok: false,
      error: `Skill \`name\` is limited to ${MAX_CUSTOM_SKILL_NAME} characters.`,
    };
  }
  if (!content) {
    return {
      ok: false,
      error: "Pass `content` — the instructions this skill teaches.",
    };
  }
  if (content.length > MAX_CUSTOM_SKILL_CONTENT) {
    return {
      ok: false,
      error: `Skill \`content\` is limited to ${MAX_CUSTOM_SKILL_CONTENT} characters; this one is ${content.length}. Shorten it and call again.`,
    };
  }

  return {
    ok: true,
    draft: { name, content, mode: readAgentSkillMode(args.mode) },
  };
}

export type SkillWriteTarget = {
  id: string;
  name: string;
  authoredBy?: "agent";
  managedByOrg?: boolean;
};

/**
 * Agents may only rewrite what agents wrote.
 *
 * One library is shared with the person's Skills modal, so an agent that could
 * edit anything could quietly rewrite instructions its owner had tuned — or an
 * org administrator had published to every member. Writing a new skill is
 * always available, which is what a research loop actually needs.
 */
export function agentMayModifySkill(skill: SkillWriteTarget): boolean {
  if (skill.managedByOrg || isOrgManagedCustomSkillId(skill.id)) {
    return false;
  }
  return skill.authoredBy === "agent";
}

export function skillWriteRefusal(skill: SkillWriteTarget): string {
  if (skill.managedByOrg || isOrgManagedCustomSkillId(skill.id)) {
    return `Skill ${skill.name} is published by this organization's administrator and cannot be changed here. Copy it with osmcp_clone_skill and revise the copy.`;
  }
  return `Skill ${skill.name} was written by a person and cannot be changed by an agent. Copy it with osmcp_clone_skill and revise the copy.`;
}
