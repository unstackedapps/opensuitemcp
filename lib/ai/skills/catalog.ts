import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseSkillFrontmatter } from "./bundle";
import { MAX_SKILL_FILES, normalizeSkillFilePath } from "./ids";
import {
  isSlashableMode,
  normalizeSkillModes,
  resolveSkillMode,
  type SkillKind,
  type SkillModesMap,
  shouldInjectSkillForTurn,
  slugifySkillName,
} from "./modes";
import { getCommunitySkillsDir } from "./sync-community";
import type { ConnectedSkillSource } from "./sync-connected";
import {
  connectedSkillFileMtime,
  listConnectedSkillSlugsOnDisk,
  readConnectedSkillMarkdown,
} from "./sync-connected";
import { getOracleSkillsDir } from "./sync-oracle";

export { MAX_SKILL_FILES, normalizeSkillFilePath } from "./ids";
export type { ConnectedSkillSource } from "./sync-connected";
export type SkillAuthor =
  | "Oracle NetSuite"
  | "You"
  | "OpenSuiteMCP"
  | "Community";

export type CatalogSkill = {
  id: string;
  name: string;
  description: string;
  author: SkillAuthor;
  source: "oracle" | "builtin" | "custom" | "community" | "connected";
  /** Always applied when MCP is used; not user-toggleable off by default UI */
  alwaysOn?: boolean;
  updatedAt: string;
  /** Character length of SKILL.md body (approx) */
  contentLength: number;
  /** Connected only: parent source id */
  sourceId?: string;
  /** Slash slug (folder name) */
  slug?: string;
  /** Disambiguation label for slash menu collisions */
  connectionLabel?: string;
};

export type CustomSkill = {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
  enabled?: boolean;
  /** Org admin skill — users can disable, not edit or delete. */
  managedByOrg?: boolean;
  /** Slash token without leading slash */
  slug?: string;
  /**
   * Stamped when a connected agent wrote this skill over MCP. Absent means a
   * person wrote it. One library is shared, so the guardrail that stops an
   * agent rewriting a person's skill has nothing to read without this.
   */
  authoredBy?: "agent";
  /**
   * Which agent, so a team can review what an agent left behind. `authoredBy`
   * stays the guardrail's field; this one is the record.
   */
  agentAuthor?: AgentAuthor;
  /** One line, shown in the picker and returned to an agent choosing skills. */
  description?: string;
  /**
   * Reference files beside SKILL.md, by path. Names only — the bodies live in
   * `UserSkillFile` so a settings read does not carry them.
   */
  files?: string[];
};

/** Who wrote something over MCP, for review rather than for the guardrail. */
export type AgentAuthor = {
  /** `McpApiKey.id` or `OAuthGrant.id`. */
  keyId: string;
  /** The app's name as its owner typed it. */
  keyName: string;
  /** Which AI product the app connects from, when it said. */
  connectsFrom?: string | null;
  /** NetSuite account the agent was acting against. */
  netsuiteAccountId?: string | null;
  at: string;
};

export const MAX_SKILL_DESCRIPTION = 280;

export type UserSkillSettings = {
  /** Oracle/community skill ids enabled for the session */
  enabledSkillIds: string[];
  /** Per-skill auto | slash | off (takes precedence over enabledSkillIds) */
  skillModes: SkillModesMap;
  customSkills: CustomSkill[];
  connectedSkillSources: ConnectedSkillSource[];
};

function titleFromSkillId(id: string): string {
  return id
    .replace(/^netsuite-/, "")
    .replace(/^community:/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const SUITESKILLS_PREFIX = "netsuite-suiteskills-";

/**
 * A SuiteSkill is titled by its `# ` heading — "Customers & Sales" — under
 * the SuiteSkills name Oracle ships it with, not by its folder name.
 */
export function oracleSkillName(
  id: string,
  frontmatterName: string | undefined,
  body: string,
): string {
  if (id.startsWith(SUITESKILLS_PREFIX)) {
    const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
    return `SuiteSkills ${heading || titleFromSkillId(id.slice(SUITESKILLS_PREFIX.length))}`;
  }
  return titleFromSkillId(frontmatterName || id);
}

const ALWAYS_ON_SKILL_ID = "netsuite-ai-connector-instructions";

/**
 * Max chars injected per optional skill. 15,000 fits every Oracle SuiteSkill
 * whole (Finance is 14,161); past it the model is told how to read on.
 */
export const MAX_OPTIONAL_SKILL_CHARS = 15_000;
/** Soft budget for all appended skill text per turn */
const MAX_TOTAL_SKILL_CHARS = 40_000;

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---")) {
    return markdown.trim();
  }
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) {
    return markdown.trim();
  }
  return markdown.slice(end + 4).trim();
}

function readOracleSkillBody(skillId: string): string | null {
  const filePath = path.join(getOracleSkillsDir(), skillId, "SKILL.md");
  if (!existsSync(filePath)) {
    return null;
  }
  return stripFrontmatter(readFileSync(filePath, "utf8"));
}

/** Read a vendored Oracle skill body for UI preview / injection. */
export function getOracleSkillContent(skillId: string): string | null {
  if (
    !skillId ||
    skillId.includes("..") ||
    skillId.includes("/") ||
    skillId.includes("\\") ||
    skillId.includes(":")
  ) {
    return null;
  }
  return readOracleSkillBody(skillId);
}

export function communitySlugFromId(id: string): string | null {
  if (!id.startsWith("community:")) {
    return null;
  }
  const slug = id.slice("community:".length);
  if (
    !slug ||
    slug.includes("..") ||
    slug.includes("/") ||
    slug.includes("\\") ||
    slug.includes(":")
  ) {
    return null;
  }
  return slug;
}

export function parseConnectedSkillId(
  id: string,
): { sourceId: string; slug: string } | null {
  if (!id.startsWith("connected:")) {
    return null;
  }
  const rest = id.slice("connected:".length);
  const colon = rest.indexOf(":");
  if (colon <= 0) {
    return null;
  }
  const sourceId = rest.slice(0, colon);
  const slug = rest.slice(colon + 1);
  if (
    !sourceId ||
    !slug ||
    sourceId.includes("..") ||
    slug.includes("..") ||
    sourceId.includes("/") ||
    slug.includes("/") ||
    sourceId.includes("\\") ||
    slug.includes("\\")
  ) {
    return null;
  }
  return { sourceId, slug };
}

export function connectedSkillId(sourceId: string, slug: string): string {
  return `connected:${sourceId}:${slug}`;
}

function readCommunitySkillBody(slug: string): string | null {
  const filePath = path.join(getCommunitySkillsDir(), slug, "SKILL.md");
  if (!existsSync(filePath)) {
    return null;
  }
  return stripFrontmatter(readFileSync(filePath, "utf8"));
}

export function getCommunitySkillContent(skillId: string): string | null {
  const slug = communitySlugFromId(skillId);
  if (!slug) {
    return null;
  }
  return readCommunitySkillBody(slug);
}

/**
 * Reference files beside a pack skill's SKILL.md, by path.
 *
 * Disk-backed skills — Oracle, Community, Connected — keep their folder as the
 * repo laid it out, so the files SKILL.md points at are already there.
 */
export function listSkillPackFiles(skillDir: string): {
  files: string[];
  total: number;
} {
  if (!existsSync(skillDir)) {
    return { files: [], total: 0 };
  }
  // Breadth-first, so a capped list shows the top of the folder — the index
  // and shared guidance an Oracle SuiteSkill points at first — rather than
  // the first 32 files of whichever subfolder sorts first.
  const all: string[] = [];
  let level: Array<{ dir: string; prefix: string }> = [
    { dir: skillDir, prefix: "" },
  ];
  while (level.length > 0) {
    const next: typeof level = [];
    for (const { dir, prefix } of level) {
      const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      for (const entry of entries) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          next.push({ dir: path.join(dir, entry.name), prefix: relative });
        } else if (relative !== "SKILL.md") {
          all.push(relative);
        }
      }
    }
    level = next;
  }
  return { files: all.slice(0, MAX_SKILL_FILES), total: all.length };
}

export function readSkillPackFile(
  skillDir: string,
  filePath: string,
): string | null {
  const safe = normalizeSkillFilePath(filePath);
  if (!safe) {
    return null;
  }
  const target = path.join(skillDir, safe);
  if (!path.resolve(target).startsWith(path.resolve(skillDir))) {
    return null;
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    return null;
  }
  return readFileSync(target, "utf8");
}

/** Characters one read returns. `records.json` in an Oracle skill is 3.35 MB. */
export const SKILL_FILE_PAGE_CHARS = 64_000;

/** One page of a skill file, and where the next page starts. */
export function pageSkillFile(
  content: string,
  offset = 0,
): {
  content: string;
  offset: number;
  totalChars: number;
  nextOffset?: number;
} {
  const start = Math.max(0, Math.min(Math.floor(offset), content.length));
  const end = Math.min(content.length, start + SKILL_FILE_PAGE_CHARS);
  return {
    content: content.slice(start, end),
    offset: start,
    totalChars: content.length,
    ...(end < content.length ? { nextOffset: end } : {}),
  };
}

export const isSkillMd = (filePath: string): boolean =>
  filePath.replace(/^\.\//, "").toUpperCase() === "SKILL.MD";

/**
 * `../netsuite-sdf-roles-and-permissions/SKILL.md` — Oracle's skills link to
 * each other by folder, with or without the leading `../`.
 */
const SIBLING_SKILL_PATH = /^(?:\.\.\/)?([a-z0-9][a-z0-9._-]*)\/(.+)$/i;

/**
 * A file from a pack skill's own folder, or from another skill in the same
 * pack when the path names that skill's folder.
 */
export function readPackSkillFile(
  filePath: string,
  folder: string,
  toId: (folder: string) => string,
  dirOf: (id: string) => string | null,
  bodyOf: (id: string) => string | null,
): string | null {
  const ownDir = dirOf(toId(folder));
  const own = ownDir ? readSkillPackFile(ownDir, filePath) : null;
  if (own !== null) {
    return own;
  }
  const sibling = SIBLING_SKILL_PATH.exec(filePath.trim());
  if (!sibling) {
    return null;
  }
  const siblingId = toId(sibling[1]);
  if (isSkillMd(sibling[2])) {
    return bodyOf(siblingId);
  }
  const siblingDir = dirOf(siblingId);
  return siblingDir ? readSkillPackFile(siblingDir, sibling[2]) : null;
}

export function oracleSkillDir(skillId: string): string | null {
  if (!skillId || /[\\/:]|\.\./.test(skillId)) {
    return null;
  }
  return path.join(getOracleSkillsDir(), skillId);
}

export function communitySkillDir(skillId: string): string | null {
  const slug = communitySlugFromId(skillId);
  return slug ? path.join(getCommunitySkillsDir(), slug) : null;
}

export function listOracleCatalogSkills(): CatalogSkill[] {
  const skillsDir = getOracleSkillsDir();
  if (!existsSync(skillsDir)) {
    return [];
  }

  const dirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return dirs.map((id) => {
    const rawPath = path.join(skillsDir, id, "SKILL.md");
    const raw = existsSync(rawPath) ? readFileSync(rawPath, "utf8") : "";
    const fm = parseSkillFrontmatter(raw);
    const body = stripFrontmatter(raw);
    let updatedAt = new Date().toISOString().slice(0, 10);
    try {
      updatedAt = statSync(rawPath).mtime.toISOString().slice(0, 10);
    } catch {
      /* keep today */
    }
    return {
      id,
      name: oracleSkillName(id, fm.name, body),
      description: fm.description ?? "Oracle SuiteCloud Agent Skill",
      author: "Oracle NetSuite" as const,
      source: "oracle" as const,
      alwaysOn: id === ALWAYS_ON_SKILL_ID,
      updatedAt,
      contentLength: body.length,
      slug: id,
    };
  });
}

export function listCommunityCatalogSkills(): CatalogSkill[] {
  const skillsDir = getCommunitySkillsDir();
  if (!existsSync(skillsDir)) {
    return [];
  }

  const dirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return dirs.map((slug) => {
    const id = `community:${slug}`;
    const rawPath = path.join(skillsDir, slug, "SKILL.md");
    const raw = existsSync(rawPath) ? readFileSync(rawPath, "utf8") : "";
    const fm = parseSkillFrontmatter(raw);
    const body = stripFrontmatter(raw);
    let updatedAt = new Date().toISOString().slice(0, 10);
    try {
      updatedAt = statSync(rawPath).mtime.toISOString().slice(0, 10);
    } catch {
      /* keep today */
    }
    return {
      id,
      name: fm.name ? titleFromSkillId(fm.name) : titleFromSkillId(slug),
      description: fm.description ?? "Community SuiteCloud Agent Skill",
      author: "Community" as const,
      source: "community" as const,
      updatedAt,
      contentLength: body.length,
      slug,
    };
  });
}

export function listConnectedCatalogSkills(
  userId: string,
  sources: ConnectedSkillSource[],
): CatalogSkill[] {
  const skills: CatalogSkill[] = [];

  for (const source of sources) {
    for (const slug of listConnectedSkillSlugsOnDisk(userId, source.id)) {
      const raw = readConnectedSkillMarkdown(userId, source.id, slug) ?? "";
      const fm = parseSkillFrontmatter(raw);
      const body = stripFrontmatter(raw);
      skills.push({
        id: connectedSkillId(source.id, slug),
        name: fm.name ? titleFromSkillId(fm.name) : titleFromSkillId(slug),
        description: fm.description ?? "Connected skill",
        author: "You" as const,
        source: "connected" as const,
        updatedAt: connectedSkillFileMtime(userId, source.id, slug),
        contentLength: body.length,
        sourceId: source.id,
        slug,
        connectionLabel: source.label,
      });
    }
  }

  return skills.sort((a, b) => a.slug?.localeCompare(b.slug ?? "") ?? 0);
}

export function getConnectedSkillContent(
  userId: string,
  skillId: string,
): string | null {
  const parsed = parseConnectedSkillId(skillId);
  if (!parsed) {
    return null;
  }
  const raw = readConnectedSkillMarkdown(userId, parsed.sourceId, parsed.slug);
  if (raw === null) {
    return null;
  }
  return stripFrontmatter(raw);
}

export function getDefaultEnabledSkillIds(): string[] {
  // Connector instructions are always-on separately; start with finance analyst off.
  return [];
}

function normalizeConnectedSources(raw: unknown): ConnectedSkillSource[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter(
      (item): item is ConnectedSkillSource =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as ConnectedSkillSource).id === "string" &&
        typeof (item as ConnectedSkillSource).url === "string" &&
        typeof (item as ConnectedSkillSource).owner === "string" &&
        typeof (item as ConnectedSkillSource).repo === "string",
    )
    .map((item) => ({
      id: item.id,
      url: item.url,
      owner: item.owner,
      repo: item.repo,
      ref: typeof item.ref === "string" ? item.ref : "main",
      path: typeof item.path === "string" ? item.path : "",
      label:
        typeof item.label === "string"
          ? item.label
          : `${item.owner}/${item.repo}`,
      lastSyncedAt:
        typeof item.lastSyncedAt === "string"
          ? item.lastSyncedAt
          : new Date().toISOString(),
      skillCount: typeof item.skillCount === "number" ? item.skillCount : 0,
      lastError:
        typeof item.lastError === "string" || item.lastError === null
          ? item.lastError
          : null,
    }));
}

export function normalizeAgentAuthor(value: unknown): AgentAuthor | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const keyId = typeof record.keyId === "string" ? record.keyId.trim() : "";
  if (!keyId || keyId.length > 128) {
    return undefined;
  }
  const keyName =
    typeof record.keyName === "string"
      ? record.keyName.trim().slice(0, 128)
      : "";
  return {
    keyId,
    keyName: keyName || "Agent",
    ...(typeof record.connectsFrom === "string" && record.connectsFrom.trim()
      ? { connectsFrom: record.connectsFrom.trim().slice(0, 64) }
      : {}),
    ...(typeof record.netsuiteAccountId === "string" &&
    record.netsuiteAccountId.trim()
      ? { netsuiteAccountId: record.netsuiteAccountId.trim().slice(0, 64) }
      : {}),
    at: typeof record.at === "string" ? record.at : new Date().toISOString(),
  };
}

/** Reference paths beside SKILL.md, kept relative and free of traversal. */
export function normalizeSkillFilePaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  for (const entry of value) {
    const filePath = normalizeSkillFilePath(entry);
    if (filePath) {
      seen.add(filePath);
    }
    if (seen.size >= MAX_SKILL_FILES) {
      break;
    }
  }
  return [...seen];
}

/**
 * A skill's one-line description.
 *
 * Skills written before the field existed, and every SKILL.md imported from a
 * repo, carry it in frontmatter instead — so that is read before giving up.
 */
export function skillDescription(skill: {
  description?: unknown;
  content?: unknown;
}): string | undefined {
  const explicit =
    typeof skill.description === "string" ? skill.description.trim() : "";
  if (explicit) {
    return explicit.slice(0, MAX_SKILL_DESCRIPTION);
  }
  const content = typeof skill.content === "string" ? skill.content : "";
  const fromFrontmatter = parseSkillFrontmatter(content).description;
  return fromFrontmatter
    ? fromFrontmatter.slice(0, MAX_SKILL_DESCRIPTION)
    : undefined;
}

function assignCustomSkillSlugs(skills: CustomSkill[]): CustomSkill[] {
  const used = new Set<string>();
  return skills.map((skill) => {
    const base =
      skill.slug?.trim() ||
      slugifySkillName(skill.name, `custom-${skill.id.slice(0, 8)}`);
    let slug = base;
    if (used.has(slug)) {
      const suffix = skill.id
        .replace(/[^a-z0-9]/gi, "")
        .slice(0, 6)
        .toLowerCase();
      slug = `${base.slice(0, 40)}-${suffix || "x"}`;
    }
    used.add(slug);
    return { ...skill, slug };
  });
}

export function normalizeUserSkillSettings(
  raw: unknown,
  legacyCustomInstructions?: string | null,
): UserSkillSettings {
  const empty: UserSkillSettings = {
    enabledSkillIds: getDefaultEnabledSkillIds(),
    skillModes: {},
    customSkills: [],
    connectedSkillSources: [],
  };

  let settings = empty;
  if (raw && typeof raw === "object") {
    const value = raw as Partial<UserSkillSettings> & {
      connectedSkillSources?: unknown;
      skillModes?: unknown;
    };
    const customSkills = Array.isArray(value.customSkills)
      ? value.customSkills
          .filter(
            (skill) =>
              skill &&
              typeof skill.id === "string" &&
              typeof skill.name === "string" &&
              typeof skill.content === "string",
          )
          .map((skill) => ({
            id: skill.id,
            name: skill.name.trim() || "Custom skill",
            content: skill.content,
            updatedAt:
              typeof skill.updatedAt === "string"
                ? skill.updatedAt
                : new Date().toISOString(),
            enabled: skill.enabled !== false,
            managedByOrg: skill.managedByOrg === true,
            slug:
              typeof skill.slug === "string" && skill.slug.trim().length > 0
                ? skill.slug.trim()
                : undefined,
            // Spread would be simpler, but this mapper is deliberately
            // explicit: a field it forgets is erased from every skill on the
            // next save. authoredBy is what the agent write guardrail reads.
            ...(skill.authoredBy === "agent"
              ? { authoredBy: "agent" as const }
              : {}),
            ...(normalizeAgentAuthor(skill.agentAuthor)
              ? { agentAuthor: normalizeAgentAuthor(skill.agentAuthor) }
              : {}),
            ...(skillDescription(skill)
              ? { description: skillDescription(skill) }
              : {}),
            ...(Array.isArray(skill.files) && skill.files.length > 0
              ? { files: normalizeSkillFilePaths(skill.files) }
              : {}),
          }))
      : [];
    settings = {
      enabledSkillIds: Array.isArray(value.enabledSkillIds)
        ? value.enabledSkillIds.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
      skillModes: normalizeSkillModes(value.skillModes),
      customSkills: assignCustomSkillSlugs(customSkills),
      connectedSkillSources: normalizeConnectedSources(
        value.connectedSkillSources,
      ),
    };
  }

  // One-time style migration: legacy customInstructions → custom skill
  const legacy = legacyCustomInstructions?.trim();
  if (
    legacy &&
    !settings.customSkills.some(
      (skill) => skill.id === "migrated-custom-instructions",
    )
  ) {
    settings = {
      ...settings,
      customSkills: assignCustomSkillSlugs([
        {
          id: "migrated-custom-instructions",
          name: "Custom instructions",
          content: legacy,
          updatedAt: new Date().toISOString(),
          enabled: true,
        },
        ...settings.customSkills,
      ]),
    };
  }

  return settings;
}

function catalogSkillKind(skill: CatalogSkill): SkillKind {
  if (
    skill.source === "community" ||
    skill.source === "custom" ||
    skill.source === "connected"
  ) {
    return skill.source;
  }
  return "oracle";
}

function resolveCatalogSkillMode(
  skill: CatalogSkill,
  userSettings: UserSkillSettings,
): ReturnType<typeof resolveSkillMode> {
  return resolveSkillMode({
    skillId: skill.id,
    kind: catalogSkillKind(skill),
    alwaysOn: skill.alwaysOn,
    skillModes: userSettings.skillModes,
    enabledSkillIds: userSettings.enabledSkillIds,
  });
}

/** Skills injected for this turn (excludes the always-on connector). */
export function listTurnSkills(
  userSettings: UserSkillSettings,
  options?: { invokedConnectedSkillIds?: string[] | null; userId?: string },
): Array<{ id: string; name: string }> {
  const invokedIds = options?.invokedConnectedSkillIds ?? [];
  const skills: Array<{ id: string; name: string }> = [];

  for (const skill of listOracleCatalogSkills()) {
    if (skill.alwaysOn) {
      continue;
    }
    if (
      !shouldInjectSkillForTurn(
        resolveCatalogSkillMode(skill, userSettings),
        skill.id,
        invokedIds,
      )
    ) {
      continue;
    }
    skills.push({ id: skill.id, name: skill.name });
  }

  for (const skill of listCommunityCatalogSkills()) {
    if (
      !shouldInjectSkillForTurn(
        resolveCatalogSkillMode(skill, userSettings),
        skill.id,
        invokedIds,
      )
    ) {
      continue;
    }
    skills.push({ id: skill.id, name: skill.name });
  }

  for (const skill of userSettings.customSkills) {
    const mode = resolveSkillMode({
      skillId: skill.id,
      kind: "custom",
      skillModes: userSettings.skillModes,
      enabledSkillIds: userSettings.enabledSkillIds,
      customEnabled: skill.enabled !== false,
    });
    if (!shouldInjectSkillForTurn(mode, skill.id, invokedIds)) {
      continue;
    }
    skills.push({
      id: skill.id,
      name: skill.name.trim() || "Custom skill",
    });
  }

  if (options?.userId) {
    const connected = listConnectedCatalogSkills(
      options.userId,
      userSettings.connectedSkillSources,
    );
    for (const skill of connected) {
      const mode = resolveCatalogSkillMode(skill, userSettings);
      if (!shouldInjectSkillForTurn(mode, skill.id, invokedIds)) {
        continue;
      }
      skills.push({ id: skill.id, name: skill.name });
    }
  }

  return skills;
}

/** Names of skills active for this session (for inventory / config tools). */
export function listEnabledSkillNames(
  userSettings: UserSkillSettings,
  options?: { invokedConnectedSkillIds?: string[] | null; userId?: string },
): string[] {
  const names: string[] = ["AI Connector Instructions (always on)"];
  const invokedIds = options?.invokedConnectedSkillIds ?? [];

  for (const skill of listOracleCatalogSkills()) {
    if (skill.alwaysOn) {
      continue;
    }
    if (
      !shouldInjectSkillForTurn(
        resolveCatalogSkillMode(skill, userSettings),
        skill.id,
        invokedIds,
      )
    ) {
      continue;
    }
    names.push(skill.name);
  }

  for (const skill of listCommunityCatalogSkills()) {
    if (
      !shouldInjectSkillForTurn(
        resolveCatalogSkillMode(skill, userSettings),
        skill.id,
        invokedIds,
      )
    ) {
      continue;
    }
    names.push(skill.name);
  }

  for (const skill of userSettings.customSkills) {
    const mode = resolveSkillMode({
      skillId: skill.id,
      kind: "custom",
      skillModes: userSettings.skillModes,
      enabledSkillIds: userSettings.enabledSkillIds,
      customEnabled: skill.enabled !== false,
    });
    if (!shouldInjectSkillForTurn(mode, skill.id, invokedIds)) {
      continue;
    }
    names.push(skill.name?.trim() || "Custom skill");
  }

  if (options?.userId) {
    const connected = listConnectedCatalogSkills(
      options.userId,
      userSettings.connectedSkillSources,
    );
    for (const skill of connected) {
      const mode = resolveCatalogSkillMode(skill, userSettings);
      if (!shouldInjectSkillForTurn(mode, skill.id, invokedIds)) {
        continue;
      }
      names.push(mode === "slash" ? `${skill.name} (invoked)` : skill.name);
    }
  }

  return names;
}

/**
 * Build skill text to append to the system prompt.
 * Skips always-on connector skill body by default — condensed rules live in
 * `lib/ai/prompts.ts` (avoids duplicating ~16KB). Optional Oracle/community
 * skills + enabled custom skills are injected within budget. Connected skills
 * inject only when `invokedConnectedSkillIds` is set for this turn.
 *
 * Always includes an ENABLED SKILLS inventory so the model can answer
 * “what skills do you have?” even when optional bodies are empty/truncated.
 */
/**
 * Name the files a skill carries, at the end of its own text.
 *
 * SKILL.md is injected; the material it points at is not. Without this the
 * model reads "run references/intake.md" and has no way to know that file is
 * reachable, so a skill pack's own instructions become unfollowable.
 */
function withReferenceNote(
  content: string,
  name: string | undefined,
  files: string[] | undefined,
): string {
  if (!files?.length) {
    return content;
  }
  const label = name?.trim() || "this skill";
  return [
    content.trimEnd(),
    "",
    `Files in ${label}: ${files.join(", ")}. Read one with the readSkillFile tool — pass skill "${label}" and the path — when these instructions point at it.`,
  ].join("\n");
}

export function buildSkillsPromptSection(
  userSettings: UserSkillSettings,
  options?: {
    includeAlwaysOn?: boolean;
    invokedConnectedSkillIds?: string[] | null;
    userId?: string;
  },
): string {
  const parts: string[] = [];
  const leftOut: string[] = [];
  let used = 0;
  const enabledNames = listEnabledSkillNames(userSettings, options);

  // `readAs` is the name the readSkillFile tool finds the skill by; `note`
  // goes after any cut, so a long skill still says what it carries.
  const push = (
    title: string,
    body: string,
    maxChars?: number,
    extra?: { readAs?: string; note?: string },
  ) => {
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }
    const readAs = extra?.readAs ?? title;
    const limited =
      maxChars && trimmed.length > maxChars
        ? `${trimmed.slice(0, maxChars)}\n\n[Cut at ${maxChars} of ${trimmed.length} characters. Read the rest with the readSkillFile tool: skill "${readAs}", path "SKILL.md", offset ${maxChars}.]`
        : trimmed;
    const block = [`### ${title}`, limited, extra?.note]
      .filter(Boolean)
      .join("\n\n");
    if (used + block.length > MAX_TOTAL_SKILL_CHARS) {
      leftOut.push(readAs);
      return;
    }
    parts.push(block);
    used += block.length;
  };

  const packNote = (name: string, dir: string | null): string | undefined => {
    const { files, total } = dir
      ? listSkillPackFiles(dir)
      : { files: [], total: 0 };
    if (total === 0) {
      return;
    }
    return total > files.length
      ? `${name} carries ${total} files beside these instructions. Read one with the readSkillFile tool — pass skill "${name}" and the path these instructions give.`
      : withReferenceNote("", name, files).trim();
  };

  if (options?.includeAlwaysOn) {
    const connector = readOracleSkillBody(ALWAYS_ON_SKILL_ID);
    if (connector) {
      push(
        "NetSuite AI Connector Instructions (always on)",
        connector,
        MAX_OPTIONAL_SKILL_CHARS,
      );
    }
  }

  const invokedIds = options?.invokedConnectedSkillIds ?? [];

  const oracleCatalog = listOracleCatalogSkills().filter(
    (skill) => !skill.alwaysOn,
  );
  for (const skill of oracleCatalog) {
    if (
      !shouldInjectSkillForTurn(
        resolveCatalogSkillMode(skill, userSettings),
        skill.id,
        invokedIds,
      )
    ) {
      continue;
    }
    const body = readOracleSkillBody(skill.id);
    if (body) {
      push(skill.name, body, MAX_OPTIONAL_SKILL_CHARS, {
        note: packNote(skill.name, oracleSkillDir(skill.id)),
      });
    }
  }

  for (const skill of listCommunityCatalogSkills()) {
    if (
      !shouldInjectSkillForTurn(
        resolveCatalogSkillMode(skill, userSettings),
        skill.id,
        invokedIds,
      )
    ) {
      continue;
    }
    const body = readCommunitySkillBody(skill.slug ?? "");
    if (body) {
      push(skill.name, body, MAX_OPTIONAL_SKILL_CHARS, {
        note: packNote(skill.name, communitySkillDir(skill.id)),
      });
    }
  }

  for (const skill of userSettings.customSkills) {
    const mode = resolveSkillMode({
      skillId: skill.id,
      kind: "custom",
      skillModes: userSettings.skillModes,
      enabledSkillIds: userSettings.enabledSkillIds,
      customEnabled: skill.enabled !== false,
    });
    if (!shouldInjectSkillForTurn(mode, skill.id, invokedIds)) {
      continue;
    }
    push(
      skill.name || "Custom skill",
      withReferenceNote(skill.content, skill.name, skill.files),
      MAX_OPTIONAL_SKILL_CHARS,
    );
  }

  if (options?.userId) {
    const connectedMeta = listConnectedCatalogSkills(
      options.userId,
      userSettings.connectedSkillSources,
    );
    for (const skill of connectedMeta) {
      const mode = resolveCatalogSkillMode(skill, userSettings);
      if (!shouldInjectSkillForTurn(mode, skill.id, invokedIds)) {
        continue;
      }
      const body = getConnectedSkillContent(options.userId, skill.id);
      if (!body) {
        continue;
      }
      push(
        mode === "slash" ? `${skill.name} (invoked)` : skill.name,
        body,
        MAX_OPTIONAL_SKILL_CHARS,
        { readAs: skill.name },
      );
    }
  }

  const leftOutNote =
    leftOut.length > 0
      ? `\n\nLeft out of this turn to fit the context budget: ${leftOut.join(", ")}. When the request needs one, read it with the readSkillFile tool, path "SKILL.md".`
      : "";

  const inventory = `==============================
ENABLED SKILLS
==============================

These skills are active for this session. If the user asks what skills you have access to, list them by name (do not invent others):
${enabledNames.map((name) => `- ${name}`).join("\n")}

AI Connector Instructions are always on (core NetSuite MCP rules are already in your system prompt). Skills set to Auto are injected every turn. Skills set to Slash command are injected when the user types /skill-name.${leftOutNote}`;

  if (parts.length === 0) {
    return `\n\n${inventory}\n`;
  }

  return `\n\n${inventory}\n\n==============================\nACTIVE SKILL INSTRUCTIONS\n==============================\n\nApply the following skill instructions when relevant to the user's request.\n\n${parts.join("\n\n---\n\n")}`;
}

export type SlashableComposerSkill = {
  id: string;
  name: string;
  description: string;
  slug: string;
  connectionLabel: string;
};

export function listSlashableComposerSkills(
  userSettings: UserSkillSettings,
  options: {
    oracle: CatalogSkill[];
    community: CatalogSkill[];
    connected: CatalogSkill[];
    disabledConnectedSourceIds?: string[];
  },
): SlashableComposerSkill[] {
  const disabled = new Set(options.disabledConnectedSourceIds ?? []);
  const skills: SlashableComposerSkill[] = [];

  const pushIfSlashable = (
    skill: {
      id: string;
      name: string;
      description?: string;
      slug?: string;
      alwaysOn?: boolean;
    },
    kind: SkillKind,
    connectionLabel: string,
    customEnabled?: boolean,
  ) => {
    if (skill.alwaysOn) {
      return;
    }
    const slug = skill.slug?.trim() || slugifySkillName(skill.name);
    if (!slug) {
      return;
    }
    const mode = resolveSkillMode({
      skillId: skill.id,
      kind,
      alwaysOn: skill.alwaysOn,
      skillModes: userSettings.skillModes,
      enabledSkillIds: userSettings.enabledSkillIds,
      customEnabled,
    });
    if (!isSlashableMode(mode)) {
      return;
    }
    skills.push({
      id: skill.id,
      name: skill.name,
      description: skill.description ?? "",
      slug,
      connectionLabel,
    });
  };

  for (const skill of options.oracle) {
    pushIfSlashable(skill, "oracle", "Oracle");
  }
  for (const skill of options.community) {
    pushIfSlashable(skill, "community", "Community");
  }
  for (const skill of userSettings.customSkills) {
    pushIfSlashable(
      {
        id: skill.id,
        name: skill.name,
        description: "Custom skill",
        slug: skill.slug,
      },
      "custom",
      "Custom",
      skill.enabled !== false,
    );
  }
  for (const skill of options.connected) {
    if (skill.sourceId && disabled.has(skill.sourceId)) {
      continue;
    }
    pushIfSlashable(skill, "connected", skill.connectionLabel ?? "Connected");
  }

  return skills.sort((a, b) => a.slug.localeCompare(b.slug));
}

export { ALWAYS_ON_SKILL_ID };
