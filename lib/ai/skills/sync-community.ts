import path from "node:path";
import { listSkillMdFiles, writeSkillPack } from "./github-sync";

const COMMUNITY_REPO_OWNER = "unstackedapps";
const COMMUNITY_REPO_NAME = "opensuitemcp-community-skills";
const COMMUNITY_SKILLS_PATH = "skills";

/**
 * On-disk Community skill pack (shared for all users).
 * Populated by `pnpm skills:sync` (boot + weekly cron).
 */
export function getCommunitySkillsDir(): string {
  const fromEnv = process.env.COMMUNITY_SKILLS_DIR?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return path.join(process.cwd(), ".data", "community-skills");
}

/**
 * Sync Community SKILL.md files from GitHub `skills/**` (skips `in-progress/`).
 * Local id = leaf folder name.
 */
export async function syncCommunitySkills(): Promise<boolean> {
  const skillsDir = getCommunitySkillsDir();
  const { skills } = await listSkillMdFiles({
    owner: COMMUNITY_REPO_OWNER,
    repo: COMMUNITY_REPO_NAME,
    path: COMMUNITY_SKILLS_PATH,
    maxSkills: 200,
  });

  // Deduplicate by leaf slug (last wins if collision across buckets)
  const bySlug = new Map<string, string>();
  for (const skill of skills) {
    bySlug.set(skill.slug, skill.markdown);
  }

  const wrote = writeSkillPack(
    skillsDir,
    [...bySlug.entries()].map(([localId, markdown]) => ({ localId, markdown })),
  );

  console.log(
    `[skills] Synced ${wrote} Community SKILL.md file(s) → ${skillsDir}`,
  );
  return true;
}

export const COMMUNITY_REPO_URL =
  "https://github.com/unstackedapps/opensuitemcp-community-skills";
