import "server-only";

import {
  getPersonaContent,
  isPersonaBuilderId,
  normalizeCustomPersonas,
} from "@/lib/ai/personas/catalog";
import {
  detachSkillEverywhere,
  MAX_PAIRED_SKILL_IDS,
  normalizePersonaSkillIds,
  type PersonaSkillIds,
  pairedSkillIdsFor,
  personasCarryingSkill,
  setPairedSkillIds,
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
  type AgentAuthor,
  type CustomSkill,
  MAX_SKILL_DESCRIPTION,
  normalizeSkillFilePath,
  normalizeUserSkillSettings,
  skillDescription,
} from "@/lib/ai/skills/catalog";
import {
  applySkillModeChange,
  isSkillInvocationMode,
  resolveSkillMode,
} from "@/lib/ai/skills/modes";
import {
  type ResolvedUserSkill,
  readUserSkillContent,
  readUserSkillFile,
  resolveUserSkillSurface,
} from "@/lib/ai/skills/user-surface";
import { getUserSettings, upsertUserSettings } from "@/lib/db/queries";
import { deleteSkillFiles } from "@/lib/db/skill-files";
import { validateOrgSkillSettingsPatch } from "@/lib/org/enforcement";
import { generateUUID } from "@/lib/utils";
import type { McpPrincipal } from "../authenticate";
import { type McpToolDefinition, toolError, toolResult } from "./types";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

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

/** Which agent wrote this, so a person reviewing later knows what to ask. */
function agentAuthorFor(principal: McpPrincipal): AgentAuthor {
  return {
    keyId: principal.keyId,
    keyName: principal.keyName,
    ...(principal.connectsFrom ? { connectsFrom: principal.connectsFrom } : {}),
    ...(principal.pinnedNetSuiteAccountId
      ? { netsuiteAccountId: principal.pinnedNetSuiteAccountId }
      : {}),
    at: new Date().toISOString(),
  };
}

type SkillState = {
  settings: Awaited<ReturnType<typeof getUserSettings>>;
  customSkills: CustomSkill[];
  skillModes: Record<string, "auto" | "slash" | "off">;
  enabledSkillIds: string[];
  customPersonas: CustomPersona[];
  personaSkillIds: PersonaSkillIds;
};

async function loadSkillState(userId: string): Promise<SkillState> {
  const settings = await getUserSettings({ userId });
  const skills = normalizeUserSkillSettings(settings ?? {});
  return {
    settings,
    customSkills: skills.customSkills,
    skillModes: skills.skillModes,
    enabledSkillIds: skills.enabledSkillIds,
    customPersonas: normalizeCustomPersonas(settings?.customPersonas),
    personaSkillIds: normalizePersonaSkillIds(settings?.personaSkillIds),
  };
}

/**
 * Every skill this user can reach, from all four sources.
 *
 * A pairing may name an Oracle, Community or Connected skill as readily as a
 * custom one — the turn injects any of them — so validation runs against the
 * whole surface rather than the custom list alone.
 */
async function loadSkillSurface(
  principal: McpPrincipal,
  settings: SkillState["settings"],
): Promise<ResolvedUserSkill[]> {
  return await resolveUserSkillSurface({
    userId: principal.userId,
    orgId: principal.orgId,
    settings: settings ?? {},
    disabledOrgConnectedSkillSourceIds:
      settings?.disabledOrgConnectedSkillSourceIds,
  });
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
    ...(skillDescription(skill)
      ? { description: skillDescription(skill) }
      : {}),
    ...(skill.files?.length ? { files: skill.files } : {}),
  };
}

/** Personas are named, not listed as ids, wherever a person reads the result. */
function personaNames(
  personaIds: readonly string[],
  customPersonas: CustomPersona[],
): string[] {
  return personaIds.map(
    (id) => getPersonaContent(id, customPersonas)?.name ?? id,
  );
}

function resolvePersonaForPairing(
  personaId: string,
  customPersonas: CustomPersona[],
): { persona: { id: string; name: string } } | { error: string } {
  if (isPersonaBuilderId(personaId)) {
    return {
      error:
        "The persona builder is an OpenSuiteMCP interview mode, not a specialist that carries skills.",
    };
  }
  const persona = getPersonaContent(personaId, customPersonas);
  if (!persona) {
    return {
      error: `No persona \`${personaId}\` is available to this user. Call osmcp_list_personas for the ids that are.`,
    };
  }
  return { persona: { id: persona.id, name: persona.name } };
}

const createSkill: McpToolDefinition = {
  name: "osmcp_create_skill",
  title: "Create skill",
  description:
    'Write a new skill into this OpenSuiteMCP user\'s library. A skill is NetSuite practice written for an assistant to follow — how a task is done in this account, what to check, what to avoid. It is saved for the user and listed in their Skills panel marked as agent-authored, so write it to the same standard a person would. Call osmcp_get_skill on an existing skill first to learn the structure and voice expected. A new skill is invoked by name rather than applied to every chat turn: pass `mode: "auto"` to apply it to all of them, or `pairWith` to attach it to a persona, which brings the skill along whenever that persona is adopted.',
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
      description: {
        type: "string",
        description:
          "One line naming what this skill is for, shown in the user's Skills panel and returned by osmcp_list_skills. Write it so another agent can choose between skills without opening each one.",
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
          "A persona `id` from osmcp_list_personas, builtin or custom. That persona carries this skill into every turn it is adopted for. Use osmcp_pair_skills to change a persona's whole set.",
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
    let paired: { id: string; name: string } | null = null;
    if (pairWith) {
      const resolved = resolvePersonaForPairing(pairWith, state.customPersonas);
      if ("error" in resolved) {
        return toolError(resolved.error);
      }
      if (
        pairedSkillIdsFor(state.personaSkillIds, resolved.persona.id).length >=
        MAX_PAIRED_SKILL_IDS
      ) {
        return toolError(
          `Persona ${resolved.persona.name} already carries the maximum of ${MAX_PAIRED_SKILL_IDS} skills.`,
        );
      }
      paired = resolved.persona;
    }

    const described = readString(args, "description").slice(
      0,
      MAX_SKILL_DESCRIPTION,
    );
    const skill: CustomSkill = {
      id: generateUUID(),
      name: draft.name,
      content: draft.content,
      ...(described ? { description: described } : {}),
      updatedAt: new Date().toISOString(),
      enabled: draft.mode === "auto",
      authoredBy: "agent",
      agentAuthor: agentAuthorFor(principal),
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

    const personaSkillIds = paired
      ? setPairedSkillIds(state.personaSkillIds, paired.id, [
          ...pairedSkillIdsFor(state.personaSkillIds, paired.id),
          skill.id,
        ])
      : undefined;

    await upsertUserSettings({
      userId: principal.userId,
      customSkills: overlaid.customSkills,
      skillModes: applied.skillModes,
      ...(personaSkillIds ? { personaSkillIds } : {}),
    });

    const saved =
      overlaid.customSkills.find((entry) => entry.id === skill.id) ?? skill;

    return toolResult(
      {
        ...describeSkill(saved, applied.skillModes, applied.enabledSkillIds),
        ...(paired ? { pairedWith: paired.id } : {}),
      },
      paired
        ? `Created skill ${saved.name} and paired it with persona ${paired.name}.`
        : draft.mode === "auto"
          ? `Created skill ${saved.name}, applied to every chat turn.`
          : `Created skill ${saved.name}, invocable as /${saved.slug ?? saved.name}.`,
    );
  },
};

const cloneSkill: McpToolDefinition = {
  name: "osmcp_clone_skill",
  title: "Clone skill",
  description:
    "Copy any skill this user can read into a new agent-authored skill, which this agent may then revise. This is how to build on a skill a person or an organization wrote: the original is left alone, the copy is yours. Oracle, Community, Connected and Custom skills can all be cloned. Pass `name` to title the copy.",
  inputSchema: {
    type: "object",
    properties: {
      skillId: {
        type: "string",
        description: "The `id` of any skill from osmcp_list_skills.",
      },
      name: {
        type: "string",
        description: "Name for the copy. Defaults to the original's name.",
      },
      mode: {
        type: "string",
        enum: ["slash", "auto"],
        description: "`slash` (default) or `auto`, as for osmcp_create_skill.",
      },
      pairWith: {
        type: "string",
        description: "A persona `id` to attach the copy to.",
      },
    },
    required: ["skillId"],
    additionalProperties: false,
  },
  annotations: { title: "Clone skill", ...WRITE },
  execute: async (args, principal) => {
    const skillId = readString(args, "skillId");
    if (!skillId) {
      return toolError("Pass the `skillId` of a skill from osmcp_list_skills.");
    }

    const state = await loadSkillState(principal.userId);
    const personal = state.customSkills.filter((entry) => !entry.managedByOrg);
    if (personal.length >= MAX_CUSTOM_SKILLS) {
      return toolError(
        `This user already has the maximum of ${MAX_CUSTOM_SKILLS} custom skills. Delete one with osmcp_delete_skill before cloning another.`,
      );
    }

    const found = await readUserSkillContent({
      userId: principal.userId,
      orgId: principal.orgId,
      settings: state.settings ?? {},
      skillId,
      disabledOrgConnectedSkillSourceIds:
        state.settings?.disabledOrgConnectedSkillSourceIds,
    });
    if (!found) {
      return toolError(
        `No skill \`${skillId}\` is available to this user. Call osmcp_list_skills for the ids that are.`,
      );
    }

    const parsed = readSkillDraft({
      name: readString(args, "name") || found.skill.name,
      content: found.content,
      mode: args.mode,
    });
    if (!parsed.ok) {
      return toolError(parsed.error);
    }
    const { draft } = parsed;

    const pairWith = readString(args, "pairWith");
    let paired: { id: string; name: string } | null = null;
    if (pairWith) {
      const resolved = resolvePersonaForPairing(pairWith, state.customPersonas);
      if ("error" in resolved) {
        return toolError(resolved.error);
      }
      paired = resolved.persona;
    }

    const clone: CustomSkill = {
      id: generateUUID(),
      name: draft.name,
      content: draft.content,
      ...(found.skill.description && found.skill.description !== "Custom skill"
        ? { description: found.skill.description }
        : {}),
      updatedAt: new Date().toISOString(),
      enabled: draft.mode === "auto",
      authoredBy: "agent",
      agentAuthor: agentAuthorFor(principal),
    };

    const applied = applySkillModeChange({
      skillId: clone.id,
      kind: "custom",
      mode: draft.mode,
      skillModes: state.skillModes,
      enabledSkillIds: state.enabledSkillIds,
      customSkills: withSlugs([...state.customSkills, clone]),
    });

    const overlaid = await overlayForOrg(principal.orgId, applied.customSkills);
    if ("error" in overlaid) {
      return toolError(overlaid.error);
    }

    const personaSkillIds = paired
      ? setPairedSkillIds(state.personaSkillIds, paired.id, [
          ...pairedSkillIdsFor(state.personaSkillIds, paired.id),
          clone.id,
        ])
      : undefined;

    await upsertUserSettings({
      userId: principal.userId,
      customSkills: overlaid.customSkills,
      skillModes: applied.skillModes,
      ...(personaSkillIds ? { personaSkillIds } : {}),
    });

    const saved =
      overlaid.customSkills.find((entry) => entry.id === clone.id) ?? clone;

    return toolResult(
      {
        ...describeSkill(saved, applied.skillModes, applied.enabledSkillIds),
        clonedFrom: found.skill.id,
        ...(paired ? { pairedWith: paired.id } : {}),
      },
      `Cloned ${found.skill.name} as ${saved.name}.`,
    );
  },
};

const updateSkill: McpToolDefinition = {
  name: "osmcp_update_skill",
  title: "Update skill",
  description:
    "Revise a skill this agent wrote — the way a research loop lands a better version of its own instructions. Only agent-authored skills can be changed: a skill a person or an organization wrote is theirs, so build on it with osmcp_clone_skill instead. Pass only the fields to change.",
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
      description: {
        type: "string",
        description: "New one-line summary.",
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
    const described = readString(args, "description").slice(
      0,
      MAX_SKILL_DESCRIPTION,
    );
    const modeArg = args.mode;
    const wantsMode =
      typeof modeArg === "string" && isSkillInvocationMode(modeArg);
    if (!(name || content || described || wantsMode)) {
      return toolError(
        "Pass at least one of `name`, `content`, `description`, or `mode`.",
      );
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
      ...(name ? { name } : {}),
      ...(content ? { content } : {}),
      ...(described ? { description: described } : {}),
      updatedAt: new Date().toISOString(),
      authoredBy: "agent",
      agentAuthor: agentAuthorFor(principal),
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
      {
        ...describeSkill(saved, applied.skillModes, applied.enabledSkillIds),
        carriedBy: personasCarryingSkill(state.personaSkillIds, skillId),
      },
      `Updated skill ${saved.name}.`,
    );
  },
};

const deleteSkill: McpToolDefinition = {
  name: "osmcp_delete_skill",
  title: "Delete skill",
  description:
    "Remove a skill this agent wrote, and release it from every persona carrying it. The personas themselves are kept. Only agent-authored skills can be deleted. Call osmcp_get_skill first if the result matters — the content is not recoverable.",
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

    const carriedBy = personasCarryingSkill(state.personaSkillIds, skillId);
    const personaSkillIds = detachSkillEverywhere(
      state.personaSkillIds,
      skillId,
    );

    await upsertUserSettings({
      userId: principal.userId,
      customSkills: overlaid.customSkills,
      skillModes,
      ...(carriedBy.length > 0 ? { personaSkillIds } : {}),
    });
    await deleteSkillFiles({ userId: principal.userId, skillIds: [skillId] });

    const released = personaNames(carriedBy, state.customPersonas);

    return toolResult(
      {
        id: skillId,
        deleted: true,
        releasedFrom: carriedBy,
      },
      released.length > 0
        ? `Deleted skill ${existing.name} and released it from ${released.join(", ")}.`
        : `Deleted skill ${existing.name}.`,
    );
  },
};

const pairSkills: McpToolDefinition = {
  name: "osmcp_pair_skills",
  title: "Pair skills with a persona",
  description:
    "Set which skills a persona carries. Adopting that persona injects them for the turn even when their mode is `slash`, so a specialist arrives with its practice. Works on any persona this user has, builtin or custom, and on any skill from any source — the pairing is this user's own setting rather than a change to what the persona says. Pass the complete list: it replaces what the persona carried. Pass an empty array to carry none.",
  inputSchema: {
    type: "object",
    properties: {
      personaId: {
        type: "string",
        description: "A persona `id` from osmcp_list_personas.",
      },
      skillIds: {
        type: "array",
        items: { type: "string" },
        description: `Skill \`id\`s from osmcp_list_skills, at most ${MAX_PAIRED_SKILL_IDS}. Replaces the persona's current set.`,
      },
    },
    required: ["personaId", "skillIds"],
    additionalProperties: false,
  },
  annotations: { title: "Pair skills", ...WRITE, idempotentHint: true },
  execute: async (args, principal) => {
    const personaId = readString(args, "personaId");
    if (!personaId) {
      return toolError(
        "Pass the `personaId` of a persona to pair skills with.",
      );
    }
    if (!Array.isArray(args.skillIds)) {
      return toolError(
        "Pass `skillIds` as an array of skill ids. An empty array carries none.",
      );
    }

    const state = await loadSkillState(principal.userId);
    const resolved = resolvePersonaForPairing(personaId, state.customPersonas);
    if ("error" in resolved) {
      return toolError(resolved.error);
    }

    const requested = args.skillIds.filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0,
    );
    if (requested.length > MAX_PAIRED_SKILL_IDS) {
      return toolError(
        `A persona carries at most ${MAX_PAIRED_SKILL_IDS} skills; this call passed ${requested.length}.`,
      );
    }

    const surface = await loadSkillSurface(principal, state.settings);
    const available = new Set(
      surface.filter((entry) => entry.mode !== "off").map((entry) => entry.id),
    );
    const missing = requested.filter((id) => !available.has(id.trim()));
    if (missing.length > 0) {
      return toolError(
        `Skill \`${missing[0]}\` is not available to this user, or is switched off. Call osmcp_list_skills for the ids that are.`,
      );
    }

    const personaSkillIds = setPairedSkillIds(
      state.personaSkillIds,
      resolved.persona.id,
      requested.map((id) => id.trim()),
    );

    await upsertUserSettings({
      userId: principal.userId,
      personaSkillIds,
    });

    const carried = pairedSkillIdsFor(personaSkillIds, resolved.persona.id);
    const names = carried.map(
      (id) => surface.find((entry) => entry.id === id)?.name ?? id,
    );

    return toolResult(
      {
        personaId: resolved.persona.id,
        name: resolved.persona.name,
        skillIds: carried,
      },
      carried.length > 0
        ? `${resolved.persona.name} now carries ${names.join(", ")}.`
        : `${resolved.persona.name} now carries no skills.`,
    );
  },
};

const readSkillFileTool: McpToolDefinition = {
  name: "osmcp_read_skill_file",
  title: "Read a skill reference file",
  description:
    "Read one reference file beside a skill's SKILL.md. A skill is a folder: SKILL.md is the entry point, and the material it points at — intake questions, troubleshooting tables, worked patterns — sits in files beside it. osmcp_get_skill lists them; read one when SKILL.md tells you to, rather than pulling them all in advance.",
  inputSchema: {
    type: "object",
    properties: {
      skillId: {
        type: "string",
        description: "The `id` from osmcp_list_skills.",
      },
      path: {
        type: "string",
        description:
          "A path from the `files` list on osmcp_get_skill, e.g. `references/intake.md`.",
      },
    },
    required: ["skillId", "path"],
    additionalProperties: false,
  },
  annotations: { title: "Read a skill reference file", ...READ_ONLY },
  execute: async (args, principal) => {
    const skillId = readString(args, "skillId");
    const path = normalizeSkillFilePath(readString(args, "path"));
    if (!skillId) {
      return toolError("Pass the `skillId` of a skill from osmcp_list_skills.");
    }
    if (!path) {
      return toolError(
        "Pass a `path` from the `files` list on osmcp_get_skill, relative to the skill folder.",
      );
    }

    const settings = await getUserSettings({ userId: principal.userId });
    // Reading a file is reading the skill: the same visibility rules apply, so
    // a skill switched off has no readable references either.
    const found = await readUserSkillContent({
      userId: principal.userId,
      orgId: principal.orgId,
      settings: settings ?? {},
      skillId,
      disabledOrgConnectedSkillSourceIds:
        settings?.disabledOrgConnectedSkillSourceIds,
    });
    if (!found) {
      return toolError(
        `No skill \`${skillId}\` is available to this user. Call osmcp_list_skills for the ids that are.`,
      );
    }

    const content = await readUserSkillFile({
      userId: principal.userId,
      orgId: principal.orgId,
      settings: settings ?? {},
      skill: found.skill,
      path,
    });
    if (content === null) {
      return toolError(
        `Skill ${found.skill.name} has no file \`${path}\`. Call osmcp_get_skill for the paths it does have.`,
      );
    }

    return toolResult({ skillId, path, content }, content);
  },
};

export const skillWriteTools: McpToolDefinition[] = [
  createSkill,
  cloneSkill,
  updateSkill,
  deleteSkill,
  pairSkills,
  readSkillFileTool,
];
