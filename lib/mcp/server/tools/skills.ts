import "server-only";

import { normalizeCustomPersonas } from "@/lib/ai/personas/catalog";
import {
  MAX_PAIRED_SKILL_IDS,
  prunePairedSkillIds,
} from "@/lib/ai/personas/pairing";
import type { CustomPersona } from "@/lib/ai/personas/types";
import {
  agentMayModifySkill,
  MAX_CUSTOM_SKILL_CONTENT,
  MAX_CUSTOM_SKILL_NAME,
  MAX_CUSTOM_SKILLS,
  readAgentSkillMode,
  readSkillDraft,
  skillWriteRefusal,
} from "@/lib/ai/skills/authoring";
import {
  type CustomSkill,
  normalizeUserSkillSettings,
} from "@/lib/ai/skills/catalog";
import {
  applySkillModeChange,
  isSkillInvocationMode,
  resolveSkillMode,
} from "@/lib/ai/skills/modes";
import { getUserSettings, upsertUserSettings } from "@/lib/db/queries";
import { validateOrgSkillSettingsPatch } from "@/lib/org/enforcement";
import { generateUUID } from "@/lib/utils";
import { type McpToolDefinition, toolError, toolResult } from "./types";

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

function readString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

type SkillState = {
  customSkills: CustomSkill[];
  skillModes: Record<string, "auto" | "slash" | "off">;
  enabledSkillIds: string[];
  customPersonas: CustomPersona[];
};

async function loadSkillState(userId: string): Promise<SkillState> {
  const settings = await getUserSettings({ userId });
  const skills = normalizeUserSkillSettings(settings ?? {});
  return {
    customSkills: skills.customSkills,
    skillModes: skills.skillModes,
    enabledSkillIds: skills.enabledSkillIds,
    customPersonas: normalizeCustomPersonas(settings?.customPersonas),
  };
}

/**
 * Org installs publish skills of their own into the same list. Running the
 * next array past the org overlay before it is written is what stops an agent
 * dropping or rewriting one of those; it throws when the patch touches one.
 */
async function overlayForOrg(
  orgId: string | null,
  customSkills: CustomSkill[],
): Promise<{ customSkills: CustomSkill[] } | { error: string }> {
  if (!orgId) {
    return { customSkills };
  }
  try {
    const overlaid = await validateOrgSkillSettingsPatch({
      orgId,
      nextCustomSkills: customSkills,
    });
    return { customSkills: overlaid.customSkills ?? customSkills };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "This organization does not allow that change to its skills.",
    };
  }
}

/** Slugs are assigned by the same normalizer the Skills modal saves through. */
function withSlugs(customSkills: CustomSkill[]): CustomSkill[] {
  return normalizeUserSkillSettings({ customSkills }).customSkills;
}

function describeSkill(
  skill: CustomSkill,
  skillModes: Record<string, "auto" | "slash" | "off">,
  enabledSkillIds: string[],
): Record<string, unknown> {
  return {
    id: skill.id,
    name: skill.name,
    slug: skill.slug ?? null,
    mode: resolveSkillMode({
      skillId: skill.id,
      kind: "custom",
      skillModes,
      enabledSkillIds,
      customEnabled: skill.enabled,
    }),
    authoredBy: skill.authoredBy ?? "user",
  };
}

const createSkill: McpToolDefinition = {
  name: "osmcp_create_skill",
  title: "Create skill",
  description:
    'Write a new skill into this OpenSuiteMCP user\'s library. A skill is NetSuite practice written for an assistant to follow — how a task is done in this account, what to check, what to avoid. It is saved for the user and listed in their Skills panel marked as agent-authored, so write it to the same standard a person would. Call osmcp_get_skill on an existing skill first to learn the structure and voice expected. A new skill is invocable by name rather than applied to every chat turn: pass `mode: "auto"` to apply it to all of them, or `pairWith` to attach it to a persona, which brings the skill along whenever that persona is adopted.',
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Display name, e.g. 'Intercompany JE Review'.",
      },
      content: {
        type: "string",
        description:
          "The skill as markdown: the procedure, the checks that catch a bad result, the record types and saved searches it relies on, and the cases where it does not apply. Write it as instructions addressed to whoever follows it.",
      },
      mode: {
        type: "string",
        enum: ["slash", "auto"],
        description:
          "`slash` (default) makes the skill invocable by name. `auto` appends it to every chat turn in the OpenSuiteMCP UI.",
      },
      pairWith: {
        type: "string",
        description:
          "A persona `id` from osmcp_list_personas. That persona carries this skill into every turn it is adopted for. Only personas this agent wrote can be paired.",
      },
    },
    required: ["name", "content"],
    additionalProperties: false,
  },
  annotations: { title: "Create skill", ...WRITE },
  execute: async (args, principal) => {
    const parsed = readSkillDraft({
      name: args.name,
      content: args.content,
      mode: args.mode,
    });
    if (!parsed.ok) {
      return toolError(parsed.error);
    }
    const { draft } = parsed;

    const state = await loadSkillState(principal.userId);
    const personal = state.customSkills.filter((entry) => !entry.managedByOrg);
    if (personal.length >= MAX_CUSTOM_SKILLS) {
      return toolError(
        `This user already has the maximum of ${MAX_CUSTOM_SKILLS} custom skills. Delete one with osmcp_delete_skill before writing another.`,
      );
    }

    const pairWith = readString(args, "pairWith");
    let persona: CustomPersona | undefined;
    if (pairWith) {
      persona = state.customPersonas.find((entry) => entry.id === pairWith);
      if (!persona) {
        return toolError(
          `No custom persona \`${pairWith}\` belongs to this user. Call osmcp_list_personas for the ids that do.`,
        );
      }
      if (persona.authoredBy !== "agent") {
        return toolError(
          `Persona ${persona.name} was written by a person, so an agent cannot change the skills it carries. Pair this skill with a persona written by osmcp_create_persona.`,
        );
      }
      if ((persona.skillIds?.length ?? 0) >= MAX_PAIRED_SKILL_IDS) {
        return toolError(
          `Persona ${persona.name} already carries the maximum of ${MAX_PAIRED_SKILL_IDS} skills.`,
        );
      }
    }

    const skill: CustomSkill = {
      id: generateUUID(),
      name: draft.name,
      content: draft.content,
      updatedAt: new Date().toISOString(),
      enabled: draft.mode === "auto",
      authoredBy: "agent",
    };

    const applied = applySkillModeChange({
      skillId: skill.id,
      kind: "custom",
      mode: draft.mode,
      skillModes: state.skillModes,
      enabledSkillIds: state.enabledSkillIds,
      customSkills: withSlugs([...state.customSkills, skill]),
    });

    const overlaid = await overlayForOrg(principal.orgId, applied.customSkills);
    if ("error" in overlaid) {
      return toolError(overlaid.error);
    }

    const paired = persona;
    const customPersonas = paired
      ? state.customPersonas.map((entry) =>
          entry.id === paired.id
            ? {
                ...entry,
                skillIds: [...(entry.skillIds ?? []), skill.id],
                updatedAt: new Date().toISOString(),
              }
            : entry,
        )
      : undefined;

    await upsertUserSettings({
      userId: principal.userId,
      customSkills: overlaid.customSkills,
      skillModes: applied.skillModes,
      ...(customPersonas ? { customPersonas } : {}),
    });

    const saved =
      overlaid.customSkills.find((entry) => entry.id === skill.id) ?? skill;

    return toolResult(
      {
        ...describeSkill(saved, applied.skillModes, applied.enabledSkillIds),
        ...(persona ? { pairedWith: persona.id } : {}),
      },
      persona
        ? `Created skill ${saved.name} and paired it with persona ${persona.name}.`
        : draft.mode === "auto"
          ? `Created skill ${saved.name}, applied to every chat turn.`
          : `Created skill ${saved.name}, invocable as /${saved.slug ?? saved.name}.`,
    );
  },
};

const updateSkill: McpToolDefinition = {
  name: "osmcp_update_skill",
  title: "Update skill",
  description:
    "Revise a skill this agent wrote — the way a research loop lands a better version of its own instructions. Only agent-authored skills can be changed: a skill a person or an organization wrote is theirs, so refine it by writing a new one instead. Pass only the fields to change.",
  inputSchema: {
    type: "object",
    properties: {
      skillId: {
        type: "string",
        description: "The `id` of an agent-authored skill.",
      },
      name: { type: "string", description: "New display name." },
      content: {
        type: "string",
        description: "Replacement markdown for the whole skill.",
      },
      mode: {
        type: "string",
        enum: ["slash", "auto"],
        description:
          "`slash` makes the skill invocable by name. `auto` appends it to every chat turn.",
      },
    },
    required: ["skillId"],
    additionalProperties: false,
  },
  annotations: { title: "Update skill", ...WRITE, idempotentHint: true },
  execute: async (args, principal) => {
    const skillId = readString(args, "skillId");
    if (!skillId) {
      return toolError("Pass the `skillId` of a skill this agent wrote.");
    }

    const state = await loadSkillState(principal.userId);
    const existing = state.customSkills.find((entry) => entry.id === skillId);
    if (!existing) {
      return toolError(
        `No custom skill \`${skillId}\` belongs to this user. Call osmcp_list_skills for the ids that do.`,
      );
    }
    if (!agentMayModifySkill(existing)) {
      return toolError(skillWriteRefusal(existing));
    }

    const name = readString(args, "name");
    const content = readString(args, "content");
    const modeArg = args.mode;
    const wantsMode =
      typeof modeArg === "string" && isSkillInvocationMode(modeArg);
    if (!(name || content || wantsMode)) {
      return toolError("Pass at least one of `name`, `content`, or `mode`.");
    }
    if (modeArg !== undefined && !wantsMode) {
      return toolError("`mode` must be `slash` or `auto`.");
    }
    if (name && name.length > MAX_CUSTOM_SKILL_NAME) {
      return toolError(
        `Skill \`name\` is limited to ${MAX_CUSTOM_SKILL_NAME} characters.`,
      );
    }
    if (content && content.length > MAX_CUSTOM_SKILL_CONTENT) {
      return toolError(
        `Skill \`content\` is limited to ${MAX_CUSTOM_SKILL_CONTENT} characters; this one is ${content.length}.`,
      );
    }

    const mode = wantsMode
      ? readAgentSkillMode(modeArg)
      : resolveSkillMode({
          skillId,
          kind: "custom",
          skillModes: state.skillModes,
          enabledSkillIds: state.enabledSkillIds,
          customEnabled: existing.enabled,
        });
    if (mode === "off") {
      return toolError(
        `Skill ${existing.name} is switched off by its owner. A person turns it back on in the OpenSuiteMCP Skills panel.`,
      );
    }

    const updated: CustomSkill = {
      ...existing,
      // Slug is dropped so the normalizer re-derives it from a changed name.
      ...(name ? { name, slug: undefined } : {}),
      ...(content ? { content } : {}),
      updatedAt: new Date().toISOString(),
      authoredBy: "agent",
    };

    const applied = applySkillModeChange({
      skillId,
      kind: "custom",
      mode,
      skillModes: state.skillModes,
      enabledSkillIds: state.enabledSkillIds,
      customSkills: withSlugs(
        state.customSkills.map((entry) =>
          entry.id === skillId ? updated : entry,
        ),
      ),
    });

    const overlaid = await overlayForOrg(principal.orgId, applied.customSkills);
    if ("error" in overlaid) {
      return toolError(overlaid.error);
    }

    await upsertUserSettings({
      userId: principal.userId,
      customSkills: overlaid.customSkills,
      skillModes: applied.skillModes,
    });

    const saved =
      overlaid.customSkills.find((entry) => entry.id === skillId) ?? updated;

    return toolResult(
      describeSkill(saved, applied.skillModes, applied.enabledSkillIds),
      `Updated skill ${saved.name}.`,
    );
  },
};

const deleteSkill: McpToolDefinition = {
  name: "osmcp_delete_skill",
  title: "Delete skill",
  description:
    "Remove a skill this agent wrote, and detach it from every persona carrying it. Only agent-authored skills can be deleted.",
  inputSchema: {
    type: "object",
    properties: {
      skillId: {
        type: "string",
        description: "The `id` of an agent-authored skill.",
      },
    },
    required: ["skillId"],
    additionalProperties: false,
  },
  annotations: {
    title: "Delete skill",
    ...WRITE,
    destructiveHint: true,
    idempotentHint: true,
  },
  execute: async (args, principal) => {
    const skillId = readString(args, "skillId");
    if (!skillId) {
      return toolError("Pass the `skillId` of a skill this agent wrote.");
    }

    const state = await loadSkillState(principal.userId);
    const existing = state.customSkills.find((entry) => entry.id === skillId);
    if (!existing) {
      return toolError(`No custom skill \`${skillId}\` belongs to this user.`);
    }
    if (!agentMayModifySkill(existing)) {
      return toolError(skillWriteRefusal(existing));
    }

    const remaining = state.customSkills.filter(
      (entry) => entry.id !== skillId,
    );
    const overlaid = await overlayForOrg(principal.orgId, remaining);
    if ("error" in overlaid) {
      return toolError(overlaid.error);
    }

    const skillModes = Object.fromEntries(
      Object.entries(state.skillModes).filter(([id]) => id !== skillId),
    );

    // A persona must not keep pointing at a skill nothing resolves.
    const remainingIds = overlaid.customSkills.map((entry) => entry.id);
    const detachedFrom: string[] = [];
    const customPersonas = state.customPersonas.map((persona) => {
      if (!persona.skillIds?.includes(skillId)) {
        return persona;
      }
      detachedFrom.push(persona.name);
      return {
        ...persona,
        skillIds: prunePairedSkillIds(persona.skillIds, remainingIds),
      };
    });

    await upsertUserSettings({
      userId: principal.userId,
      customSkills: overlaid.customSkills,
      skillModes,
      ...(detachedFrom.length > 0 ? { customPersonas } : {}),
    });

    return toolResult(
      {
        id: skillId,
        deleted: true,
        ...(detachedFrom.length > 0 ? { detachedFrom } : {}),
      },
      detachedFrom.length > 0
        ? `Deleted skill ${existing.name} and detached it from ${detachedFrom.join(", ")}.`
        : `Deleted skill ${existing.name}.`,
    );
  },
};

export const skillWriteTools: McpToolDefinition[] = [
  createSkill,
  updateSkill,
  deleteSkill,
];
