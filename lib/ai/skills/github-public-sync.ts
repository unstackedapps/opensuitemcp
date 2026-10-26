/**
 * Sync public GitHub skill packs without the REST API (no rate-limit bucket).
 * Downloads a branch tarball from codeload.github.com and walks SKILL.md
 * folders.
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
import { type FetchedSkillMd, TEXT_FILE_PATTERN } from "./github-sync";

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
    skippedFiles: string[];
  },
): void {
  if (options.skills.length >= options.maxSkills) {
    return;
  }

  let entries: ReturnType<typeof readdirSync>;
  try {
    // Sorted, so two runs over the same archive find skills in the same order.
    entries = readdirSync(absoluteDir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
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

    const files = readSkillFolderFiles(absoluteDir, options.skippedFiles);
    options.skills.push({
      slug,
      relativeDir: relativeFromRoot || slug,
      markdown,
      ...(files.length > 0 ? { files } : {}),
    });
  }
}

/**
 * Every file beside a SKILL.md, whole.
 *
 * No count or length cap: an Oracle SuiteSkill keeps up to 355 files behind
 * one SKILL.md, and a file cut short or left behind is a link that leads
 * nowhere. The archive size cap bounds the total.
 */
function readSkillFolderFiles(
  skillDir: string,
  skippedFiles: string[],
): Array<{ path: string; content: string }> {
  const out: Array<{ path: string; content: string }> = [];
  const walk = (dir: string, prefix: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // A folder with its own SKILL.md is a skill of its own.
        if (!existsSync(path.join(absolute, "SKILL.md"))) {
          walk(absolute, relative);
        }
        continue;
      }
      if (!entry.isFile() || relative === "SKILL.md") {
        continue;
      }
      if (!TEXT_FILE_PATTERN.test(entry.name)) {
        skippedFiles.push(path.join(path.basename(skillDir), relative));
        continue;
      }
      out.push({ path: relative, content: readFileSync(absolute, "utf8") });
    }
  };
  walk(skillDir, "");
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * List SKILL.md files, each with its whole folder, from a public GitHub repo
 * via tarball download. `skippedFiles` names the files left out because they
 * are not text.
 */
export async function listPublicSkillMdFiles(
  options: PublicSkillMdListOptions,
): Promise<{ ref: string; skills: FetchedSkillMd[]; skippedFiles: string[] }> {
  const ref = await resolvePublicRepoRef(
    options.owner,
    options.repo,
    options.ref,
  );
  const rootPath = (options.path ?? "").replace(/^\/+|\/+$/g, "");

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
    return { ref, ...collectSkillFolders(startDir, rootPath, options) };
  } finally {
    cleanup();
  }
}

/** Walk an extracted tree for SKILL.md folders. */
export function collectSkillFolders(
  startDir: string,
  rootPath: string,
  options: { maxSkills?: number; skipDirNames?: string[] } = {},
): { skills: FetchedSkillMd[]; skippedFiles: string[] } {
  const skills: FetchedSkillMd[] = [];
  const skippedFiles: string[] = [];
  walkPublicSkillMdFiles(startDir, rootPath, {
    rootPath,
    skills,
    maxSkills: options.maxSkills ?? 200,
    skipDirNames: new Set(options.skipDirNames ?? ["in-progress"]),
    skippedFiles,
  });
  return { skills, skippedFiles };
}
