/**
 * A skill as a folder: SKILL.md plus reference files beside it.
 *
 * Mirrors the layout skill packs already use on disk and in the repos the
 * Connected sync walks — `SKILL.md` at the root, supporting material under
 * `references/`. SKILL.md is the entry point and stays small; a reference is
 * read only when something asks for it.
 *
 * Pure: the zip codec, the caps and the path rules live here so they can be
 * tested without a database or a request.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { MAX_SKILL_FILES, normalizeSkillFilePath } from "./ids";

/** Per reference file. A SKILL.md is capped separately, at 32k. */
export const MAX_SKILL_FILE_CHARS = 64_000;
/** Whole bundle, SKILL.md included. */
export const MAX_SKILL_BUNDLE_CHARS = 256_000;

export const SKILL_ENTRY_FILENAME = "SKILL.md";

/**
 * A fixed timestamp for every entry.
 *
 * An ISO string rather than a number: fflate reads a numeric `mtime` in
 * seconds, not milliseconds. Midday rather than midnight, and well clear of
 * 1980, because the value is converted to local time before the format's
 * 1980-2099 range is checked — a UTC midnight on the boundary fails west of
 * Greenwich and passes east of it.
 */
const ZIP_EPOCH = "2020-01-01T12:00:00Z";

export type SkillFile = { path: string; content: string };

export type SkillBundle = {
  /** SKILL.md — the entry point every skill has. */
  content: string;
  files: SkillFile[];
};

export type BundleResult =
  | { ok: true; bundle: SkillBundle }
  | { ok: false; error: string };

function textLength(bundle: SkillBundle): number {
  return (
    bundle.content.length +
    bundle.files.reduce((total, file) => total + file.content.length, 0)
  );
}

/** Text a reference can hold. Binary never enters a skill. */
function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 512);
  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Drop the single wrapping folder a zip usually carries.
 *
 * Archiving a skill folder produces `my-skill/SKILL.md`, and the paths inside
 * SKILL.md are written relative to that folder — so the prefix has to come off
 * or every reference link breaks.
 */
function stripCommonRoot(paths: string[]): (path: string) => string {
  const segments = paths
    .filter((path) => path.includes("/"))
    .map((path) => path.split("/")[0]);
  const roots = new Set(segments);
  if (roots.size !== 1 || segments.length !== paths.length) {
    return (path) => path;
  }
  const root = `${[...roots][0]}/`;
  return (path) => (path.startsWith(root) ? path.slice(root.length) : path);
}

export function readSkillZip(bytes: Uint8Array): BundleResult {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    return { ok: false, error: "That file is not a readable .zip archive." };
  }

  const names = Object.keys(entries).filter(
    (name) => !name.endsWith("/") && !name.split("/").includes("__MACOSX"),
  );
  if (names.length === 0) {
    return { ok: false, error: "The archive is empty." };
  }

  const strip = stripCommonRoot(names);
  let content: string | null = null;
  const files: SkillFile[] = [];

  for (const name of names.sort()) {
    const relative = strip(name);
    const entryBytes = entries[name];
    if (looksBinary(entryBytes)) {
      continue;
    }
    const text = strFromU8(entryBytes);

    if (relative.toUpperCase() === SKILL_ENTRY_FILENAME.toUpperCase()) {
      content = text;
      continue;
    }
    const path = normalizeSkillFilePath(relative);
    if (!path) {
      continue;
    }
    if (text.length > MAX_SKILL_FILE_CHARS) {
      return {
        ok: false,
        error: `\`${path}\` is ${text.length} characters; a reference file is limited to ${MAX_SKILL_FILE_CHARS}.`,
      };
    }
    if (files.length >= MAX_SKILL_FILES) {
      return {
        ok: false,
        error: `A skill carries at most ${MAX_SKILL_FILES} reference files.`,
      };
    }
    files.push({ path, content: text });
  }

  if (content === null) {
    return {
      ok: false,
      error: `The archive has no ${SKILL_ENTRY_FILENAME} at its root.`,
    };
  }

  const bundle = { content, files };
  if (textLength(bundle) > MAX_SKILL_BUNDLE_CHARS) {
    return {
      ok: false,
      error: `The whole skill is limited to ${MAX_SKILL_BUNDLE_CHARS} characters; this one is ${textLength(bundle)}.`,
    };
  }
  return { ok: true, bundle };
}

export function writeSkillZip(
  bundle: SkillBundle,
  folderName: string,
): Uint8Array {
  const root = folderName.trim() || "skill";
  const entries: Record<string, Uint8Array> = {
    [`${root}/${SKILL_ENTRY_FILENAME}`]: strToU8(bundle.content),
  };
  for (const file of bundle.files) {
    entries[`${root}/${file.path}`] = strToU8(file.content);
  }
  // mtime is fixed: a download that differs byte for byte each time cannot be
  // compared against the last one. Zip dates start at 1980, so that is the
  // epoch used rather than 0.
  return zipSync(entries, { level: 6, mtime: ZIP_EPOCH });
}

/** Frontmatter a downloaded SKILL.md carries, so a re-import keeps its name. */
export function skillMarkdownWithFrontmatter(skill: {
  name: string;
  description?: string;
  content: string;
}): string {
  const body = skill.content.trimStart();
  if (body.startsWith("---")) {
    return skill.content;
  }
  const description = skill.description?.replace(/\r?\n/g, " ").trim();
  const lines = [
    "---",
    `name: ${skill.name.replace(/\r?\n/g, " ")}`,
    ...(description ? [`description: ${description}`] : []),
    "---",
    "",
    body,
  ];
  return lines.join("\n");
}

/** Frontmatter a SKILL.md carries: its name and one-line description. */
export function parseSkillFrontmatter(raw: string): {
  name?: string;
  description?: string;
} {
  if (!raw.startsWith("---")) {
    return {};
  }
  const end = raw.indexOf("\n---", 3);
  if (end === -1) {
    return {};
  }
  const block = raw.slice(3, end);
  const nameMatch = block.match(/^name:\s*(.+)$/m);
  const descMatch = block.match(/^description:\s*(.+)$/m);
  const name = nameMatch?.[1]?.trim().replace(/^["']|["']$/g, "");
  let description = descMatch?.[1]?.trim().replace(/^["']|["']$/g, "");
  // Folded/literal descriptions are rare; keep first line if huge.
  if (description && description.length > 280) {
    description = `${description.slice(0, 277)}...`;
  }
  return {
    name: name || undefined,
    description: description || undefined,
  };
}
