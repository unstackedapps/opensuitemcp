import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  type GithubContentItem,
  githubHeaders,
  writeSkillPack,
} from "./github-sync";

const ORACLE_REPO = "oracle/netsuite-suitecloud-sdk";
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

async function fetchFileMarkdown(
  fileUrl: string,
  headers: Record<string, string>,
): Promise<string | null> {
  const skillRes = await fetch(fileUrl, { headers, cache: "no-store" });
  if (!skillRes.ok) {
    return null;
  }
  const meta = (await skillRes.json()) as {
    encoding?: string;
    content?: string;
    download_url?: string | null;
  };
  if (meta.encoding === "base64" && typeof meta.content === "string") {
    return Buffer.from(meta.content, "base64").toString("utf8");
  }
  if (meta.download_url) {
    const raw = await fetch(meta.download_url, {
      headers,
      cache: "no-store",
    });
    if (raw.ok) {
      return await raw.text();
    }
  }
  return null;
}

/**
 * Download Oracle SuiteCloud Agent Skill `SKILL.md` files from GitHub into
 * `ORACLE_SKILLS_DIR` (default `.data/oracle-skills`). Prunes skill folders
 * that no longer exist upstream so every instance shares one SoT.
 *
 * Intended to run from cron / deploy entrypoint — not from request handlers.
 */
export async function syncOracleSkills(): Promise<boolean> {
  const skillsDir = getOracleSkillsDir();
  mkdirSync(skillsDir, { recursive: true });
  const headers = githubHeaders();

  const listUrl = `https://api.github.com/repos/${ORACLE_REPO}/contents/${ORACLE_SKILLS_PATH}`;
  const listRes = await fetch(listUrl, { headers, cache: "no-store" });
  if (!listRes.ok) {
    throw new Error(`GitHub list failed: HTTP ${listRes.status}`);
  }

  const items = (await listRes.json()) as GithubContentItem[];
  if (!Array.isArray(items)) {
    throw new Error("Unexpected GitHub contents payload");
  }

  const skillDirs = items.filter(
    (item) =>
      item.type === "dir" &&
      typeof item.name === "string" &&
      item.name.startsWith("netsuite-"),
  );

  const skills: Array<{ localId: string; markdown: string }> = [];

  for (const dir of skillDirs) {
    const skillUrl = `https://api.github.com/repos/${ORACLE_REPO}/contents/${ORACLE_SKILLS_PATH}/${dir.name}/SKILL.md`;
    const markdown = await fetchFileMarkdown(skillUrl, headers);
    if (!markdown?.trim()) {
      console.warn(`[skills] Skip ${dir.name}: SKILL.md missing or empty`);
      continue;
    }
    skills.push({ localId: dir.name, markdown });
  }

  const wrote = writeSkillPack(skillsDir, skills);
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
