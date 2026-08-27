import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { listPublicSkillMdFiles } from "./github-public-sync";
import { writeSkillPack } from "./github-sync";

const ORACLE_OWNER = "oracle";
const ORACLE_REPO = "netsuite-suitecloud-sdk";
const ORACLE_REF = "master";
const ORACLE_SKILLS_PATH = "packages/agent-skills";
const ALWAYS_ON_MARKER = "netsuite-ai-connector-instructions";

/**
 * On-disk Oracle skill pack (single source of truth for all users).
 * Populated only by `pnpm skills:sync` (boot + weekly cron) — never from git.
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
 * Download Oracle SuiteCloud Agent Skill `SKILL.md` files from the public
 * GitHub archive into `ORACLE_SKILLS_DIR` (default `.data/oracle-skills`).
 * Prunes skill folders that no longer exist upstream so every instance shares
 * one SoT.
 *
 * Intended to run from cron / deploy entrypoint — not from request handlers.
 */
export async function syncOracleSkills(): Promise<boolean> {
  const skillsDir = getOracleSkillsDir();
  mkdirSync(skillsDir, { recursive: true });

  const { skills } = await listPublicSkillMdFiles({
    owner: ORACLE_OWNER,
    repo: ORACLE_REPO,
    ref: ORACLE_REF,
    path: ORACLE_SKILLS_PATH,
    maxSkills: 200,
  });

  const pack = skills
    .filter((skill) => skill.slug.startsWith("netsuite-"))
    .map((skill) => ({ localId: skill.slug, markdown: skill.markdown }));

  const wrote = writeSkillPack(skillsDir, pack);
  const ok = oracleSkillsLookHealthy(skillsDir);
  console.log(
    `[skills] Synced ${wrote} Oracle SKILL.md file(s) → ${skillsDir} (healthy=${ok})`,
  );
  if (!ok) {
    throw new Error(
      `Sync finished but missing ${ALWAYS_ON_MARKER}/SKILL.md — refusing unhealthy pack`,
    );
  }
  return true;
}
