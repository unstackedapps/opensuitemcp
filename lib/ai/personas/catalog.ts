import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  AVA_PERSONA_ID,
  BUILTIN_PERSONA_IDS,
  isBuiltinPersonaId,
  isPersonaBuilderId,
  PERSONA_BUILDER_ID,
} from "./ids";
import type { CustomPersona, PersonaSource } from "./types";

export {
  AVA_PERSONA_ID,
  BUILTIN_PERSONA_IDS,
  BUILTIN_PERSONA_SHORT_NAMES,
  clientPersonaShortName,
  clientPersonaShortNameWithCustoms,
  isBuiltinPersonaId,
  isPersonaBuilderId,
  PERSONA_BUILDER_ID,
} from "./ids";

export type { CustomPersona, PersonaSource } from "./types";

/** Max chars injected per custom persona (matches optional skills). */
export const MAX_CUSTOM_PERSONA_INJECT_CHARS = 12_000;
/** Soft ceiling for any persona body (custom storage is 32k; inject is lower). */
export const MAX_PERSONA_INJECT_CHARS = 24_000;
/** Max custom personas per user (settings + interview create). */
export const MAX_CUSTOM_PERSONAS = 32;

export type CatalogPersona = {
  id: string;
  name: string;
  shortName: string;
  primaryRole: string;
  source: PersonaSource;
  /** Full markdown for injection; null for Ava (uses buildIdentityPrompt). */
  body: string | null;
};

export type ResolvedPersona = {
  id: string;
  name: string;
  shortName: string;
  primaryRole: string;
  source: PersonaSource;
  /** Text for system prompt; null means use Ava identity. */
  instructions: string | null;
  /** SuiteQL-first personas skip the global “confirm before SuiteQL” lock. */
  confirmBeforeSuiteQL: boolean;
};

const AVA_PERSONA: CatalogPersona = {
  id: AVA_PERSONA_ID,
  name: "Ava",
  shortName: "Ava",
  primaryRole: "OpenSuiteMCP's NetSuite assistant",
  source: "ava",
  body: null,
};

const BUILDER_PERSONA: CatalogPersona = {
  id: PERSONA_BUILDER_ID,
  name: "Persona Builder",
  shortName: "Interview",
  primaryRole: "Interview the user to create or refine a custom persona",
  source: "system",
  body: null,
};

/** Filename stem → id (strip leading `NN-`). */
function idFromFilename(filename: string): string {
  const base = filename.replace(/\.md$/i, "");
  return base.replace(/^\d+-/, "");
}

export function parseMetadataField(
  raw: string,
  label: string,
): string | undefined {
  const re = new RegExp(`^\\s*-\\s*\\*\\*${label}:\\*\\*\\s*(.+)$`, "im");
  const match = raw.match(re);
  return match?.[1]?.trim();
}

function shortNameFallback(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Persona";
  }
  const first = trimmed.split(/\s+/).at(0);
  return (first && first.length > 0 ? first : trimmed).slice(0, 40);
}

function getPersonasDir(): string {
  return path.join(process.cwd(), ".personas");
}

function loadBuiltinPersonasFromDisk(): CatalogPersona[] {
  const dir = getPersonasDir();
  if (!existsSync(dir)) {
    return [];
  }

  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort();

  const personas: CatalogPersona[] = [];
  for (const file of files) {
    const id = idFromFilename(file);
    if (!id || id === AVA_PERSONA_ID || id === PERSONA_BUILDER_ID) {
      continue;
    }
    const raw = readFileSync(path.join(dir, file), "utf8");
    const name = parseMetadataField(raw, "Name") ?? id;
    const shortName = parseMetadataField(raw, "Short Name") ?? name;
    const primaryRole =
      parseMetadataField(raw, "Primary Role") ?? "NetSuite specialist";
    personas.push({
      id,
      name,
      shortName,
      primaryRole,
      source: "builtin",
      body: raw.trim(),
    });
  }
  return personas;
}

let cachedBuiltins: CatalogPersona[] | null = null;

export function listBuiltinPersonas(): CatalogPersona[] {
  if (!cachedBuiltins) {
    cachedBuiltins = [AVA_PERSONA, ...loadBuiltinPersonasFromDisk()];
  }
  return cachedBuiltins;
}

export function listBuiltinPersonaIds(): string[] {
  return [...BUILTIN_PERSONA_IDS];
}

export function normalizeCustomPersonas(value: unknown): CustomPersona[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: CustomPersona[] = [];
  for (const entry of value.slice(0, MAX_CUSTOM_PERSONAS)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const content = typeof record.content === "string" ? record.content : "";
    if (!id || id.length > 128 || !name || name.length > 200) {
      continue;
    }
    if (content.length > 32_000) {
      continue;
    }
    if (isBuiltinPersonaId(id) || isPersonaBuilderId(id)) {
      continue;
    }
    const shortNameRaw =
      typeof record.shortName === "string" ? record.shortName.trim() : "";
    const primaryRoleRaw =
      typeof record.primaryRole === "string" ? record.primaryRole.trim() : "";
    out.push({
      id,
      name,
      shortName: shortNameRaw || shortNameFallback(name),
      ...(primaryRoleRaw ? { primaryRole: primaryRoleRaw.slice(0, 300) } : {}),
      content,
      updatedAt:
        typeof record.updatedAt === "string"
          ? record.updatedAt
          : new Date().toISOString(),
    });
  }
  return out;
}

function truncateBody(body: string, max: number): string {
  if (body.length <= max) {
    return body;
  }
  return `${body.slice(0, max)}\n\n[Persona instructions truncated]`;
}

/**
 * Resolve a persona for chat. Unknown / deleted custom ids return Ava.
 * Builder resolves to the system interviewer (no NetSuite playbook body).
 */
export function resolvePersona({
  personaId,
  customPersonas = [],
}: {
  personaId: string | null | undefined;
  customPersonas?: CustomPersona[];
}): ResolvedPersona {
  const id = personaId?.trim() || AVA_PERSONA_ID;

  if (id === AVA_PERSONA_ID || !id) {
    return {
      id: AVA_PERSONA_ID,
      name: AVA_PERSONA.name,
      shortName: AVA_PERSONA.shortName,
      primaryRole: AVA_PERSONA.primaryRole,
      source: "ava",
      instructions: null,
      confirmBeforeSuiteQL: true,
    };
  }

  if (isPersonaBuilderId(id)) {
    return {
      id: BUILDER_PERSONA.id,
      name: BUILDER_PERSONA.name,
      shortName: BUILDER_PERSONA.shortName,
      primaryRole: BUILDER_PERSONA.primaryRole,
      source: "system",
      instructions: null,
      confirmBeforeSuiteQL: true,
    };
  }

  const builtin = listBuiltinPersonas().find((p) => p.id === id);
  if (builtin?.body) {
    const confirmBeforeSuiteQL = id !== "suiteql-data-analyst";
    return {
      id: builtin.id,
      name: builtin.name,
      shortName: builtin.shortName,
      primaryRole: builtin.primaryRole,
      source: "builtin",
      instructions: truncateBody(builtin.body, MAX_PERSONA_INJECT_CHARS),
      confirmBeforeSuiteQL,
    };
  }

  const custom = normalizeCustomPersonas(customPersonas).find(
    (p) => p.id === id,
  );
  if (custom) {
    return {
      id: custom.id,
      name: custom.name,
      shortName: custom.shortName,
      primaryRole: custom.primaryRole ?? "Custom persona",
      source: "custom",
      instructions: truncateBody(
        custom.content.trim(),
        MAX_CUSTOM_PERSONA_INJECT_CHARS,
      ),
      confirmBeforeSuiteQL: true,
    };
  }

  // Unknown → Ava
  return {
    id: AVA_PERSONA_ID,
    name: AVA_PERSONA.name,
    shortName: AVA_PERSONA.shortName,
    primaryRole: AVA_PERSONA.primaryRole,
    source: "ava",
    instructions: null,
    confirmBeforeSuiteQL: true,
  };
}

/** True if personaId is valid for this user (builtin, builder, or their custom). */
export function isValidPersonaId(
  personaId: string | null | undefined,
  customPersonas: CustomPersona[] = [],
): boolean {
  if (!personaId?.trim()) {
    return true; // null / empty = Ava
  }
  const id = personaId.trim();
  if (isBuiltinPersonaId(id) || isPersonaBuilderId(id)) {
    return true;
  }
  return normalizeCustomPersonas(customPersonas).some((p) => p.id === id);
}

/** Defaults / hide-picker cannot use the interview system persona. */
export function isDefaultablePersonaId(
  personaId: string | null | undefined,
  customPersonas: CustomPersona[] = [],
): boolean {
  if (isPersonaBuilderId(personaId)) {
    return false;
  }
  return isValidPersonaId(personaId, customPersonas);
}

/** Catalog entries for pickers (no full body for builtins to keep payloads small). */
export function listPersonasForClient(
  customPersonas: CustomPersona[] = [],
): Array<{
  id: string;
  name: string;
  shortName: string;
  primaryRole: string;
  source: PersonaSource;
}> {
  const builtins = listBuiltinPersonas().map((p) => ({
    id: p.id,
    name: p.name,
    shortName: p.shortName,
    primaryRole: p.primaryRole,
    source: p.source,
  }));
  const customs = normalizeCustomPersonas(customPersonas).map((p) => ({
    id: p.id,
    name: p.name,
    shortName: p.shortName,
    primaryRole: p.primaryRole ?? "Custom persona",
    source: "custom" as const,
  }));
  return [...builtins, ...customs];
}

/**
 * Full markdown (or Ava identity text) for settings preview.
 * Returns null when the id is unknown / not owned by this user.
 */
export function getPersonaContent(
  personaId: string,
  customPersonas: CustomPersona[] = [],
): { id: string; name: string; content: string } | null {
  const id = personaId.trim();
  if (!id || id === AVA_PERSONA_ID) {
    return {
      id: AVA_PERSONA_ID,
      name: AVA_PERSONA.name,
      content: `You are Ava, OpenSuiteMCP's NetSuite assistant.
You help users retrieve and act on live NetSuite account data through MCP tools.
Stay professional, concise, and NetSuite-focused. Do not present yourself as a generic chatbot.`,
    };
  }

  if (isPersonaBuilderId(id)) {
    return null;
  }

  const builtin = listBuiltinPersonas().find((p) => p.id === id);
  if (builtin?.body) {
    return {
      id: builtin.id,
      name: builtin.name,
      content: builtin.body,
    };
  }

  const custom = normalizeCustomPersonas(customPersonas).find(
    (p) => p.id === id,
  );
  if (custom) {
    return {
      id: custom.id,
      name: custom.name,
      content: custom.content,
    };
  }

  return null;
}

/** Parse Name / Short Name / Primary Role from a builtin-shaped playbook draft. */
export function parsePersonaDraftMetadata(content: string): {
  name?: string;
  shortName?: string;
  primaryRole?: string;
} {
  return {
    name: parseMetadataField(content, "Name"),
    shortName: parseMetadataField(content, "Short Name"),
    primaryRole: parseMetadataField(content, "Primary Role"),
  };
}
