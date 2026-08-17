/**
 * Shared GitHub Contents API helpers for skill-pack sync.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const MAX_SKILLS_PER_CONNECTION = 50;
export const MAX_SKILL_BODY_CHARS = 32_000;

export type GithubContentItem = {
  name: string;
  path: string;
  type: "file" | "dir" | string;
  download_url?: string | null;
  sha?: string;
};

export type ParsedGithubSkillsUrl = {
  owner: string;
  repo: string;
  /** Branch/tag/commit; undefined = use repo default branch */
  ref?: string;
  /** Path within repo (no leading slash); empty = repo root */
  path: string;
  /** Original normalized URL for display/storage */
  url: string;
};

export type FetchedSkillMd = {
  /** Leaf folder name (skill slug) */
  slug: string;
  /** Path of the SKILL.md relative to the sync root path */
  relativeDir: string;
  markdown: string;
};

export function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "opensuitemcp-skill-sync",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Accept:
 * - `owner/repo`
 * - `https://github.com/owner/repo`
 * - `https://github.com/owner/repo/tree/<ref>/<optional/path>`
 * Reject blob/raw and non-github hosts.
 */
export function parseGithubSkillsUrl(input: string): ParsedGithubSkillsUrl {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) {
    throw new Error("Invalid GitHub URL");
  }

  const shorthand = trimmed.match(
    /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/(.*))?$/,
  );
  if (
    shorthand &&
    !trimmed.includes("://") &&
    !trimmed.includes("github.com")
  ) {
    const owner = shorthand[1];
    const repo = shorthand[2].replace(/\.git$/, "");
    const rest = shorthand[3]?.replace(/^\/+|\/+$/g, "") ?? "";
    return {
      owner,
      repo,
      path: rest,
      url: `https://github.com/${owner}/${repo}${rest ? `/tree/HEAD/${rest}` : ""}`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    );
  } catch {
    throw new Error("Invalid GitHub URL");
  }

  if (
    parsed.hostname !== "github.com" &&
    parsed.hostname !== "www.github.com"
  ) {
    throw new Error("Only github.com URLs are supported");
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new Error("URL must include owner and repository");
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/, "");
  const kind = segments[2];

  if (kind === "blob" || kind === "raw") {
    throw new Error(
      "Paste a repository or folder URL (…/tree/…), not a single file",
    );
  }

  let ref: string | undefined;
  let pathParts: string[] = [];

  if (kind === "tree") {
    if (segments.length < 4) {
      throw new Error("Tree URL must include a branch or path");
    }
    ref = segments[3];
    pathParts = segments.slice(4);
  } else if (kind === undefined) {
    // repo root
  } else {
    throw new Error("Unsupported GitHub URL shape");
  }

  const repoPath = pathParts.join("/");
  const displayUrl =
    ref || repoPath
      ? `https://github.com/${owner}/${repo}/tree/${ref ?? "HEAD"}${repoPath ? `/${repoPath}` : ""}`
      : `https://github.com/${owner}/${repo}`;

  return {
    owner,
    repo,
    ref,
    path: repoPath,
    url: displayUrl,
  };
}

async function resolveDefaultBranch(
  owner: string,
  repo: string,
  headers: Record<string, string>,
): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers,
    cache: "no-store",
  });
  if (res.status === 404) {
    throw new Error(
      "Repository not found (private repos are not supported yet)",
    );
  }
  if (!res.ok) {
    throw new Error(`GitHub repo lookup failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { default_branch?: string };
  return body.default_branch?.trim() || "main";
}

async function fetchContentsJson(
  owner: string,
  repo: string,
  itemPath: string,
  ref: string,
  headers: Record<string, string>,
): Promise<GithubContentItem | GithubContentItem[]> {
  const encodedPath = itemPath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const base = `https://api.github.com/repos/${owner}/${repo}/contents`;
  const url = encodedPath
    ? `${base}/${encodedPath}?ref=${encodeURIComponent(ref)}`
    : `${base}?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, { headers, cache: "no-store" });
  if (res.status === 404) {
    throw new Error(
      "Path not found (check the URL, or the repo may be private)",
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "GitHub denied access (private repos are not supported yet)",
    );
  }
  if (!res.ok) {
    throw new Error(`GitHub contents failed: HTTP ${res.status}`);
  }
  return (await res.json()) as GithubContentItem | GithubContentItem[];
}

async function fetchSkillMarkdown(
  owner: string,
  repo: string,
  filePath: string,
  ref: string,
  headers: Record<string, string>,
): Promise<string | null> {
  const encodedPath = filePath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    return null;
  }
  const meta = (await res.json()) as {
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
 * Recursively find SKILL.md files under owner/repo@ref/path.
 * Caps at MAX_SKILLS_PER_CONNECTION.
 */
export async function listSkillMdFiles(options: {
  owner: string;
  repo: string;
  ref?: string;
  path?: string;
  maxSkills?: number;
}): Promise<{ ref: string; skills: FetchedSkillMd[] }> {
  const headers = githubHeaders();
  const ref =
    options.ref?.trim() ||
    (await resolveDefaultBranch(options.owner, options.repo, headers));
  const rootPath = (options.path ?? "").replace(/^\/+|\/+$/g, "");
  const max = options.maxSkills ?? MAX_SKILLS_PER_CONNECTION;
  const skills: FetchedSkillMd[] = [];

  async function walk(dirPath: string): Promise<void> {
    if (skills.length >= max) {
      return;
    }
    const listing = await fetchContentsJson(
      options.owner,
      options.repo,
      dirPath,
      ref,
      headers,
    );
    const items = Array.isArray(listing) ? listing : [listing];

    for (const item of items) {
      if (skills.length >= max) {
        break;
      }
      if (item.type === "file" && item.name === "SKILL.md") {
        const markdown = await fetchSkillMarkdown(
          options.owner,
          options.repo,
          item.path,
          ref,
          headers,
        );
        if (!markdown?.trim()) {
          continue;
        }
        const parentPath = item.path.replace(/\/SKILL\.md$/i, "");
        const slug = parentPath.split("/").filter(Boolean).at(-1);
        if (!slug) {
          continue;
        }
        const relativeDir = rootPath
          ? parentPath.replace(new RegExp(`^${escapeRegExp(rootPath)}/?`), "")
          : parentPath;
        skills.push({
          slug,
          relativeDir: relativeDir || slug,
          markdown:
            markdown.length > MAX_SKILL_BODY_CHARS
              ? markdown.slice(0, MAX_SKILL_BODY_CHARS)
              : markdown,
        });
        continue;
      }
      if (item.type === "dir") {
        // Skip community drafts when walking a pack that includes in-progress
        if (item.name === "in-progress") {
          continue;
        }
        await walk(item.path);
      }
    }
  }

  await walk(rootPath);
  return { ref, skills };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Write skills as `<destDir>/<localId>/SKILL.md` and prune dirs not in `seenIds`.
 */
export function writeSkillPack(
  destDir: string,
  skills: Array<{ localId: string; markdown: string }>,
): number {
  mkdirSync(destDir, { recursive: true });
  const seen = new Set<string>();
  let wrote = 0;

  for (const skill of skills) {
    if (
      !skill.localId ||
      skill.localId.includes("..") ||
      skill.localId.includes("/") ||
      skill.localId.includes("\\")
    ) {
      continue;
    }
    const skillDir = path.join(destDir, skill.localId);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(path.join(skillDir, "SKILL.md"), skill.markdown, "utf8");
    seen.add(skill.localId);
    wrote += 1;
  }

  if (existsSync(destDir)) {
    for (const entry of readdirSync(destDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (!seen.has(entry.name)) {
        rmSync(path.join(destDir, entry.name), {
          recursive: true,
          force: true,
        });
      }
    }
  }

  return wrote;
}

export function pruneDirectory(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
