import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import {
  listSkillMdFiles,
  type ParsedGithubSkillsUrl,
  parseGithubSkillsUrl,
  pruneDirectory,
  writeSkillPack,
} from "./github-sync";

export type ConnectedSkillSource = {
  id: string;
  url: string;
  owner: string;
  repo: string;
  ref: string;
  path: string;
  label: string;
  lastSyncedAt: string;
  skillCount: number;
  lastError?: string | null;
};

export function getConnectedSkillsRootDir(): string {
  const fromEnv = process.env.CONNECTED_SKILLS_DIR?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return path.join(process.cwd(), ".data", "connected-skills");
}

export function getConnectedSourceDir(
  userId: string,
  sourceId: string,
): string {
  if (
    !userId ||
    !sourceId ||
    userId.includes("..") ||
    sourceId.includes("..") ||
    userId.includes("/") ||
    sourceId.includes("/") ||
    userId.includes("\\") ||
    sourceId.includes("\\")
  ) {
    throw new Error("Invalid connected skill path");
  }
  return path.join(getConnectedSkillsRootDir(), userId, sourceId);
}

function createSourceId(): string {
  return `cs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export type SyncConnectedResult = {
  source: ConnectedSkillSource;
  skillSlugs: string[];
};

/**
 * Sync a public GitHub skills root into the per-user cache.
 */
export async function syncConnectedSkillSource(options: {
  userId: string;
  url: string;
  /** Refresh existing connection */
  existing?: ConnectedSkillSource;
}): Promise<SyncConnectedResult> {
  const parsed: ParsedGithubSkillsUrl = parseGithubSkillsUrl(options.url);
  const sourceId = options.existing?.id ?? createSourceId();
  const destDir = getConnectedSourceDir(options.userId, sourceId);
  mkdirSync(destDir, { recursive: true });

  try {
    const { ref, skills } = await listSkillMdFiles({
      owner: parsed.owner,
      repo: parsed.repo,
      ref: parsed.ref,
      path: parsed.path,
    });

    if (skills.length === 0) {
      throw new Error("No SKILL.md files found under that path");
    }

    // Dedupe slugs within one connection (nested collisions → last wins)
    const bySlug = new Map<string, string>();
    for (const skill of skills) {
      bySlug.set(skill.slug, skill.markdown);
    }

    writeSkillPack(
      destDir,
      [...bySlug.entries()].map(([localId, markdown]) => ({
        localId,
        markdown,
      })),
    );

    const label = parsed.path
      ? `${parsed.owner}/${parsed.repo}/${parsed.path}`
      : `${parsed.owner}/${parsed.repo}`;

    const source: ConnectedSkillSource = {
      id: sourceId,
      url: parsed.url,
      owner: parsed.owner,
      repo: parsed.repo,
      ref,
      path: parsed.path,
      label,
      lastSyncedAt: new Date().toISOString(),
      skillCount: bySlug.size,
      lastError: null,
    };

    return { source, skillSlugs: [...bySlug.keys()].sort() };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Connected skill sync failed";
    if (options.existing) {
      // Keep prior cache on refresh failure; surface error on source
      return {
        source: {
          ...options.existing,
          lastError: message,
        },
        skillSlugs: listConnectedSkillSlugsOnDisk(
          options.userId,
          options.existing.id,
        ),
      };
    }
    pruneDirectory(destDir);
    throw error instanceof Error ? error : new Error(message);
  }
}

export function removeConnectedSkillSource(
  userId: string,
  sourceId: string,
): void {
  pruneDirectory(getConnectedSourceDir(userId, sourceId));
}

export function listConnectedSkillSlugsOnDisk(
  userId: string,
  sourceId: string,
): string[] {
  const dir = getConnectedSourceDir(userId, sourceId);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(path.join(dir, name, "SKILL.md")))
    .sort();
}

export function readConnectedSkillMarkdown(
  userId: string,
  sourceId: string,
  slug: string,
): string | null {
  if (
    !slug ||
    slug.includes("..") ||
    slug.includes("/") ||
    slug.includes("\\")
  ) {
    return null;
  }
  const filePath = path.join(
    getConnectedSourceDir(userId, sourceId),
    slug,
    "SKILL.md",
  );
  if (!existsSync(filePath)) {
    return null;
  }
  return readFileSync(filePath, "utf8");
}

export function connectedSkillFileMtime(
  userId: string,
  sourceId: string,
  slug: string,
): string {
  try {
    return statSync(
      path.join(getConnectedSourceDir(userId, sourceId), slug, "SKILL.md"),
    )
      .mtime.toISOString()
      .slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
