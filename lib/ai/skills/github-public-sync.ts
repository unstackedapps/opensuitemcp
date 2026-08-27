/**
 * Sync public GitHub skill packs without the REST API (no rate-limit bucket).
 * Downloads a branch tarball from codeload.github.com and walks SKILL.md files.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type FetchedSkillMd, MAX_SKILL_BODY_CHARS } from "./github-sync";

const REF_CANDIDATES = ["main", "master"] as const;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

export type PublicSkillMdListOptions = {
  owner: string;
  repo: string;
  /** Branch or tag. When omitted, tries main then master. */
  ref?: string;
  /** Path within the repo (no leading slash). */
  path?: string;
  maxSkills?: number;
  skipDirNames?: string[];
};

export async function resolvePublicRepoRef(
  owner: string,
  repo: string,
  preferredRef?: string,
): Promise<string> {
  const candidates = preferredRef?.trim()
    ? [preferredRef.trim()]
    : [...REF_CANDIDATES];

  for (const ref of candidates) {
    const response = await fetch(
      `https://codeload.github.com/${owner}/${repo}/tar.gz/${encodeURIComponent(ref)}`,
      { cache: "no-store", method: "HEAD" },
    );
    if (response.ok) {
      return ref;
    }
  }

  throw new Error(
    `Could not download public archive for ${owner}/${repo} (tried ${candidates.join(", ")})`,
  );
}

async function extractPublicRepoArchive(
  owner: string,
  repo: string,
  ref: string,
): Promise<{ rootDir: string; cleanup: () => void }> {
  const response = await fetch(
    `https://codeload.github.com/${owner}/${repo}/tar.gz/${encodeURIComponent(ref)}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to download public files for ${owner}/${repo}@${ref}: HTTP ${response.status}`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error(
      `Archive for ${owner}/${repo} is too large (${buffer.byteLength} bytes)`,
    );
  }

  const tempParent = mkdtempSync(path.join(tmpdir(), "osmcp-skills-"));
  const extractResult = spawnSync("tar", ["-xzf", "-", "-C", tempParent], {
    input: buffer,
    maxBuffer: MAX_ARCHIVE_BYTES,
  });

  if (extractResult.status !== 0) {
    rmSync(tempParent, { recursive: true, force: true });
    const message =
      extractResult.stderr?.toString().trim() || "tar extraction failed";
    throw new Error(`Failed to extract ${owner}/${repo}: ${message}`);
  }

  const entries = readdirSync(tempParent);
  if (entries.length !== 1) {
    rmSync(tempParent, { recursive: true, force: true });
    throw new Error(`Unexpected archive layout for ${owner}/${repo}`);
  }

  return {
    rootDir: path.join(tempParent, entries[0]),
    cleanup: () => {
      rmSync(tempParent, { recursive: true, force: true });
    },
  };
}

function walkPublicSkillMdFiles(
  absoluteDir: string,
  relativeDir: string,
  options: {
    rootPath: string;
    skills: FetchedSkillMd[];
    maxSkills: number;
    skipDirNames: Set<string>;
  },
): void {
  if (options.skills.length >= options.maxSkills) {
    return;
  }

  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(absoluteDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (options.skills.length >= options.maxSkills) {
      break;
    }

    const entryAbsolutePath = path.join(absoluteDir, entry.name);
    const entryRelativePath = relativeDir
      ? `${relativeDir}/${entry.name}`
      : entry.name;

    if (entry.isDirectory()) {
      if (options.skipDirNames.has(entry.name)) {
        continue;
      }
      walkPublicSkillMdFiles(entryAbsolutePath, entryRelativePath, options);
      continue;
    }

    if (!entry.isFile() || entry.name !== "SKILL.md") {
      continue;
    }

    const markdown = readFileSync(entryAbsolutePath, "utf8").trim();
    if (!markdown) {
      continue;
    }

    const parentRelativePath = relativeDir;
    const slug = path.basename(parentRelativePath);
    if (!slug) {
      continue;
    }

    const trimmedRoot = options.rootPath.replace(/^\/+|\/+$/g, "");
    const relativeFromRoot = trimmedRoot
      ? parentRelativePath.replace(
          new RegExp(`^${escapeRegExp(trimmedRoot)}/?`),
          "",
        )
      : parentRelativePath;

    options.skills.push({
      slug,
      relativeDir: relativeFromRoot || slug,
      markdown:
        markdown.length > MAX_SKILL_BODY_CHARS
          ? markdown.slice(0, MAX_SKILL_BODY_CHARS)
          : markdown,
    });
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * List SKILL.md files from a public GitHub repo via tarball download.
 */
export async function listPublicSkillMdFiles(
  options: PublicSkillMdListOptions,
): Promise<{ ref: string; skills: FetchedSkillMd[] }> {
  const ref = await resolvePublicRepoRef(
    options.owner,
    options.repo,
    options.ref,
  );
  const rootPath = (options.path ?? "").replace(/^\/+|\/+$/g, "");
  const maxSkills = options.maxSkills ?? 200;
  const skipDirNames = new Set(options.skipDirNames ?? ["in-progress"]);
  const skills: FetchedSkillMd[] = [];

  const { rootDir, cleanup } = await extractPublicRepoArchive(
    options.owner,
    options.repo,
    ref,
  );

  try {
    const startDir = rootPath ? path.join(rootDir, rootPath) : rootDir;
    if (!existsSync(startDir)) {
      throw new Error(`Path not found in public repo: ${rootPath || "/"}`);
    }

    walkPublicSkillMdFiles(startDir, rootPath, {
      rootPath,
      skills,
      maxSkills,
      skipDirNames,
    });

    return { ref, skills };
  } finally {
    cleanup();
  }
}
