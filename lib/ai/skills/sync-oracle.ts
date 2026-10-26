import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { listPublicSkillMdFiles } from "./github-public-sync";
import { type FetchedSkillMd, writeSkillPack } from "./github-sync";

const ORACLE_OWNER = "oracle";
const ORACLE_REPO = "netsuite-suitecloud-sdk";
const ORACLE_REF = "master";
const ALWAYS_ON_MARKER = "netsuite-ai-connector-instructions";
/** Folders in Oracle's repo that hold test material, not shipped skills. */
const ORACLE_SKIP_DIRS = [
  "in-progress",
  "test",
  "tests",
  "__tests__",
  "fixtures",
];

/**
 * On-disk Oracle skill pack (single source of truth for all users).
 * Populated only by `pnpm skills:sync`, which runs on every container start —
 * never from git.
 */
export function getOracleSkillsDir(): string {
  const fromEnv = process.env.ORACLE_SKILLS_DIR?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return path.join(process.cwd(), ".data", "oracle-skills");
}

export function oracleSkillsLookHealthy(
  skillsDir = getOracleSkillsDir(),
): boolean {
  return existsSync(path.join(skillsDir, ALWAYS_ON_MARKER, "SKILL.md"));
}

/**
 * The Oracle skills to keep from a walk of the whole repo.
 *
 * Oracle publishes skills in more than one folder — Agent Skills under
 * `packages/agent-skills`, SuiteSkills under `packages/ai-plugins/common/skills`
 * — so the walk covers the repo and keeps every `netsuite-` skill wherever it
 * sits. The first folder with a given name wins; the rest are reported.
 */
export function oracleSkillPack(skills: FetchedSkillMd[]): {
  pack: Array<{
    localId: string;
    markdown: string;
    files?: FetchedSkillMd["files"];
  }>;
  ignored: string[];
  duplicates: string[];
} {
  const bySlug = new Map<string, FetchedSkillMd>();
  const ignored: string[] = [];
  const duplicates: string[] = [];
  for (const skill of skills) {
    if (!skill.slug.startsWith("netsuite-")) {
      ignored.push(skill.relativeDir);
      continue;
    }
    if (bySlug.has(skill.slug)) {
      duplicates.push(skill.relativeDir);
      continue;
    }
    bySlug.set(skill.slug, skill);
  }
  return {
    pack: [...bySlug.values()].map((skill) => ({
      localId: skill.slug,
      markdown: skill.markdown,
      files: skill.files,
    })),
    ignored,
    duplicates,
  };
}

/**
 * Download every Oracle skill folder from the public GitHub archive into
 * `ORACLE_SKILLS_DIR` (default `.data/oracle-skills`). Prunes skill folders
 * that no longer exist upstream so every instance shares one SoT.
 *
 * Intended to run from cron / deploy entrypoint — not from request handlers.
 */
export async function syncOracleSkills(): Promise<boolean> {
  const skillsDir = getOracleSkillsDir();
  mkdirSync(skillsDir, { recursive: true });

  const { skills, skippedFiles } = await listPublicSkillMdFiles({
    owner: ORACLE_OWNER,
    repo: ORACLE_REPO,
    ref: ORACLE_REF,
    maxSkills: 200,
    skipDirNames: ORACLE_SKIP_DIRS,
  });

  const { pack, ignored, duplicates } = oracleSkillPack(skills);
  const wrote = writeSkillPack(skillsDir, pack);
  const fileCount = pack.reduce(
    (sum, skill) => sum + 1 + (skill.files?.length ?? 0),
    0,
  );
  const ok = oracleSkillsLookHealthy(skillsDir);
  console.log(
    `[skills] Synced ${wrote} Oracle skill(s), ${fileCount} file(s) → ${skillsDir} (healthy=${ok})`,
  );
  if (ignored.length > 0) {
    console.warn(
      `[skills] Oracle SKILL.md not named netsuite-*, left out: ${ignored.join(", ")}`,
    );
  }
  if (duplicates.length > 0) {
    console.warn(
      `[skills] Oracle skill folder names already taken, left out: ${duplicates.join(", ")}`,
    );
  }
  if (skippedFiles.length > 0) {
    console.warn(
      `[skills] Oracle files that are not text, left out: ${skippedFiles.join(", ")}`,
    );
  }
  if (!ok) {
    throw new Error(
      `Sync finished but missing ${ALWAYS_ON_MARKER}/SKILL.md — refusing unhealthy pack`,
    );
  }
  return true;
}
