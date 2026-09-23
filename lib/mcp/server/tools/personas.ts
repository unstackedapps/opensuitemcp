import "server-only";

import {
  getPersonaContent,
  isBuiltinPersonaId,
  isPersonaBuilderId,
  MAX_CUSTOM_PERSONAS,
  normalizeCustomPersonas,
} from "@/lib/ai/personas/catalog";
import type { CustomPersona } from "@/lib/ai/personas/types";
import { getUserSettings, upsertUserSettings } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";
import { setMcpApiKeyPersona } from "../keys";
import { type McpToolDefinition, toolError, toolResult } from "./types";

/** Matches the per-persona storage cap enforced by normalizeCustomPersonas. */
const MAX_PERSONA_CONTENT = 32_000;
const MAX_PERSONA_NAME = 200;
const MAX_PERSONA_SHORT_NAME = 60;
const MAX_PERSONA_PRIMARY_ROLE = 300;

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

/** Short name is what the chat UI shows on a turn; derive one if none given. */
function shortNameFallback(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? name.trim();
  return first.slice(0, MAX_PERSONA_SHORT_NAME) || "Persona";
}

async function loadCustomPersonas(userId: string): Promise<{
  settings: Awaited<ReturnType<typeof getUserSettings>>;
  customs: CustomPersona[];
}> {
  const settings = await getUserSettings({ userId });
  return {
    settings,
    customs: normalizeCustomPersonas(settings?.customPersonas),
  };
}

/**
 * Agents may only rewrite what agents wrote.
 *
 * One library is shared with the person's chat picker, so an agent that could
 * edit anything could quietly rewrite a playbook its owner had tuned. Writing
 * a new persona is always available, which is all "shed this role and become
 * something else" actually needs.
 */
function agentMayModify(persona: CustomPersona): boolean {
  return persona.authoredBy === "agent";
}

const createPersona: McpToolDefinition = {
  name: "osmcp_create_persona",
  title: "Create persona",
  description:
    "Write a new persona into this OpenSuiteMCP user's library and optionally adopt it for this connection. A persona is a NetSuite specialist playbook — the role, domains, and working approach a specialist brings. The persona is saved for the user and appears in their OpenSuiteMCP persona picker marked as agent-authored. Pass `adopt: true` to assign it to this API key in the same call.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Display name, e.g. 'AP Close Specialist'.",
      },
      content: {
        type: "string",
        description:
          "The persona instructions as markdown: role, domains, tasks, risk posture, approach, tone, and constraints.",
      },
      shortName: {
        type: "string",
        description:
          "Optional short label for chat turns. Defaults to the first word of `name`.",
      },
      primaryRole: {
        type: "string",
        description:
          "Optional one-line summary of what this specialist is for.",
      },
      adopt: {
        type: "boolean",
        description:
          "Assign the new persona to this API key immediately. Defaults to false.",
      },
    },
    required: ["name", "content"],
    additionalProperties: false,
  },
  annotations: { title: "Create persona", ...WRITE },
  execute: async (args, principal) => {
    const name = readString(args, "name");
    const content = readString(args, "content");
    if (!name) {
      return toolError("Pass a `name` for the persona.");
    }
    if (name.length > MAX_PERSONA_NAME) {
      return toolError(
        `Persona \`name\` is limited to ${MAX_PERSONA_NAME} characters.`,
      );
    }
    if (!content) {
      return toolError(
        "Pass `content` — the persona instructions this specialist works by.",
      );
    }
    if (content.length > MAX_PERSONA_CONTENT) {
      return toolError(
        `Persona \`content\` is limited to ${MAX_PERSONA_CONTENT} characters; this one is ${content.length}. Shorten it and call again.`,
      );
    }

    const { customs } = await loadCustomPersonas(principal.userId);
    if (customs.length >= MAX_CUSTOM_PERSONAS) {
      return toolError(
        `This user already has the maximum of ${MAX_CUSTOM_PERSONAS} custom personas. Delete one with osmcp_delete_persona before creating another.`,
      );
    }

    const shortName =
      readString(args, "shortName").slice(0, MAX_PERSONA_SHORT_NAME) ||
      shortNameFallback(name);
    const primaryRole = readString(args, "primaryRole").slice(
      0,
      MAX_PERSONA_PRIMARY_ROLE,
    );

    const persona: CustomPersona = {
      id: generateUUID(),
      name,
      shortName,
      ...(primaryRole ? { primaryRole } : {}),
      content,
      updatedAt: new Date().toISOString(),
      authoredBy: "agent",
    };

    await upsertUserSettings({
      userId: principal.userId,
      customPersonas: [...customs, persona],
    });

    const adopt = args.adopt === true;
    if (adopt) {
      await setMcpApiKeyPersona({
        userId: principal.userId,
        keyId: principal.keyId,
        personaId: persona.id,
      });
    }

    return toolResult(
      {
        id: persona.id,
        name: persona.name,
        shortName: persona.shortName,
        ...(persona.primaryRole ? { primaryRole: persona.primaryRole } : {}),
        authoredBy: "agent",
        adopted: adopt,
      },
      adopt
        ? `Created persona ${persona.name} and adopted it for this connection.`
        : `Created persona ${persona.name}. Call osmcp_set_agent_persona to adopt it.`,
    );
  },
};

const updatePersona: McpToolDefinition = {
  name: "osmcp_update_persona",
  title: "Update persona",
  description:
    "Revise a persona this agent wrote. Only agent-authored personas can be changed — a persona a person wrote is theirs, so refine it by creating a new one instead. Pass only the fields to change.",
  inputSchema: {
    type: "object",
    properties: {
      personaId: {
        type: "string",
        description: "The `id` of an agent-authored persona.",
      },
      name: { type: "string", description: "New display name." },
      content: { type: "string", description: "New persona instructions." },
      shortName: { type: "string", description: "New short label." },
      primaryRole: { type: "string", description: "New one-line summary." },
    },
    required: ["personaId"],
    additionalProperties: false,
  },
  annotations: { title: "Update persona", ...WRITE, idempotentHint: true },
  execute: async (args, principal) => {
    const personaId = readString(args, "personaId");
    if (!personaId) {
      return toolError("Pass the `personaId` of a persona this agent wrote.");
    }

    const { customs } = await loadCustomPersonas(principal.userId);
    const existing = customs.find((entry) => entry.id === personaId);
    if (!existing) {
      return toolError(
        `No custom persona \`${personaId}\` belongs to this user. Call osmcp_list_personas for the ids that do.`,
      );
    }
    if (!agentMayModify(existing)) {
      return toolError(
        `Persona ${existing.name} was written by a person and cannot be changed by an agent. Create a new persona with osmcp_create_persona instead.`,
      );
    }

    const name = readString(args, "name");
    const content = readString(args, "content");
    const shortName = readString(args, "shortName");
    const primaryRole = readString(args, "primaryRole");
    if (!(name || content || shortName || primaryRole)) {
      return toolError(
        "Pass at least one of `name`, `content`, `shortName`, or `primaryRole`.",
      );
    }
    if (name && name.length > MAX_PERSONA_NAME) {
      return toolError(
        `Persona \`name\` is limited to ${MAX_PERSONA_NAME} characters.`,
      );
    }
    if (content && content.length > MAX_PERSONA_CONTENT) {
      return toolError(
        `Persona \`content\` is limited to ${MAX_PERSONA_CONTENT} characters; this one is ${content.length}.`,
      );
    }

    const updated: CustomPersona = {
      ...existing,
      ...(name ? { name } : {}),
      ...(content ? { content } : {}),
      ...(shortName
        ? { shortName: shortName.slice(0, MAX_PERSONA_SHORT_NAME) }
        : {}),
      ...(primaryRole
        ? { primaryRole: primaryRole.slice(0, MAX_PERSONA_PRIMARY_ROLE) }
        : {}),
      updatedAt: new Date().toISOString(),
      authoredBy: "agent",
    };

    await upsertUserSettings({
      userId: principal.userId,
      customPersonas: customs.map((entry) =>
        entry.id === personaId ? updated : entry,
      ),
    });

    return toolResult(
      {
        id: updated.id,
        name: updated.name,
        shortName: updated.shortName,
        ...(updated.primaryRole ? { primaryRole: updated.primaryRole } : {}),
        authoredBy: "agent",
      },
      `Updated persona ${updated.name}.`,
    );
  },
};

const deletePersona: McpToolDefinition = {
  name: "osmcp_delete_persona",
  title: "Delete persona",
  description:
    "Remove a persona this agent wrote. Only agent-authored personas can be deleted, and never one the user has made their default in OpenSuiteMCP. If this key is currently assigned that persona, the assignment is cleared too.",
  inputSchema: {
    type: "object",
    properties: {
      personaId: {
        type: "string",
        description: "The `id` of an agent-authored persona.",
      },
    },
    required: ["personaId"],
    additionalProperties: false,
  },
  annotations: {
    title: "Delete persona",
    ...WRITE,
    destructiveHint: true,
    idempotentHint: true,
  },
  execute: async (args, principal) => {
    const personaId = readString(args, "personaId");
    if (!personaId) {
      return toolError("Pass the `personaId` of a persona this agent wrote.");
    }

    const { settings, customs } = await loadCustomPersonas(principal.userId);
    const existing = customs.find((entry) => entry.id === personaId);
    if (!existing) {
      return toolError(
        `No custom persona \`${personaId}\` belongs to this user.`,
      );
    }
    if (!agentMayModify(existing)) {
      return toolError(
        `Persona ${existing.name} was written by a person and cannot be deleted by an agent.`,
      );
    }
    if (settings?.defaultPersonaId?.trim() === personaId) {
      return toolError(
        `Persona ${existing.name} is this user's default in OpenSuiteMCP. A person must choose a different default before it can be deleted.`,
      );
    }

    await upsertUserSettings({
      userId: principal.userId,
      customPersonas: customs.filter((entry) => entry.id !== personaId),
    });

    const wasAdopted = principal.personaId === personaId;
    if (wasAdopted) {
      await setMcpApiKeyPersona({
        userId: principal.userId,
        keyId: principal.keyId,
        personaId: null,
      });
    }

    return toolResult(
      { id: personaId, deleted: true, assignmentCleared: wasAdopted },
      wasAdopted
        ? `Deleted persona ${existing.name} and cleared it from this connection.`
        : `Deleted persona ${existing.name}.`,
    );
  },
};

const setAgentPersona: McpToolDefinition = {
  name: "osmcp_set_agent_persona",
  title: "Set agent persona",
  description:
    "Assign a persona to this API key, or shed the current one by omitting `personaId`. The assignment is reported by osmcp_whoami on every future connection, so a fresh session learns which specialist it is meant to be. It records intent only: read the instructions with osmcp_get_persona and adopt them yourself.",
  inputSchema: {
    type: "object",
    properties: {
      personaId: {
        type: "string",
        description:
          "An `id` from osmcp_list_personas. Omit or pass an empty string to shed the current persona.",
      },
    },
    additionalProperties: false,
  },
  annotations: { title: "Set agent persona", ...WRITE, idempotentHint: true },
  execute: async (args, principal) => {
    const personaId = readString(args, "personaId");

    if (!personaId) {
      await setMcpApiKeyPersona({
        userId: principal.userId,
        keyId: principal.keyId,
        personaId: null,
      });
      return toolResult(
        { personaId: null, name: null },
        "This connection no longer has an assigned persona.",
      );
    }

    if (isPersonaBuilderId(personaId)) {
      return toolError(
        "The persona builder is an OpenSuiteMCP interview mode, not a specialist an agent can adopt.",
      );
    }

    const { customs } = await loadCustomPersonas(principal.userId);
    const persona = getPersonaContent(personaId, customs);
    if (!persona) {
      return toolError(
        `No persona \`${personaId}\` is available to this user. Call osmcp_list_personas for the ids that are.`,
      );
    }

    const assigned = await setMcpApiKeyPersona({
      userId: principal.userId,
      keyId: principal.keyId,
      personaId: persona.id,
    });
    if (!assigned) {
      return toolError(
        "This API key could not be updated. A revoked key cannot change its persona.",
      );
    }

    return toolResult(
      {
        personaId: persona.id,
        name: persona.name,
        builtin: isBuiltinPersonaId(persona.id),
      },
      `This connection is now assigned the persona ${persona.name}. Call osmcp_get_persona to read its instructions.`,
    );
  },
};

export const personaTools: McpToolDefinition[] = [
  createPersona,
  updatePersona,
  deletePersona,
  setAgentPersona,
];
