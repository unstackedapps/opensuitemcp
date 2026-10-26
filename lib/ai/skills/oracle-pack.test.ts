/// <reference types="node" />
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  buildSkillsPromptSection,
  getOracleSkillContent,
  listSkillPackFiles,
  MAX_OPTIONAL_SKILL_CHARS,
  oracleSkillDir,
  oracleSkillName,
  pageSkillFile,
  readPackSkillFile,
  SKILL_FILE_PAGE_CHARS,
} from "./catalog";
import { collectSkillFolders } from "./github-public-sync";
import { writeSkillPack } from "./github-sync";
import { oracleSkillPack } from "./sync-oracle";

/**
 * Oracle publishes Agent Skills and SuiteSkills in different folders of one
 * repo, and a SuiteSkill is a folder of up to 355 files behind one SKILL.md.
 * Each of these once arrived partial: only SKILL.md synced, SKILL.md was cut at
 * 32,000 characters, and only `packages/agent-skills` was read.
 */

const root = mkdtempSync(path.join(tmpdir(), "osmcp-oracle-pack-"));
after(() => rmSync(root, { recursive: true, force: true }));

function write(relative: string, content: string): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

const LONG_SKILL = `---\nname: netsuite-sdf-safe-guide\n---\n\n${"x".repeat(40_000)}`;

describe("collectSkillFolders over Oracle's repo layout", () => {
  const repo = path.join(root, "repo");
  write(
    "repo/packages/agent-skills/netsuite-sdf-safe-guide/SKILL.md",
    LONG_SKILL,
  );
  write(
    "repo/packages/agent-skills/netsuite-sdf-safe-guide/references/05-security.md",
    "y".repeat(70_000),
  );
  write("repo/packages/agent-skills/netsuite-sdf-safe-guide/logo.png", "png");
  write(
    "repo/packages/ai-plugins/common/skills/suiteskills/netsuite-suiteskills-finance/SKILL.md",
    "---\nname: netsuite-suiteskills-finance\n---\n\n# Finance\n",
  );
  write(
    "repo/packages/ai-plugins/common/skills/suiteskills/netsuite-suiteskills-finance/runbooks/netsuite-revenue-leakage/RUNBOOK.md",
    "runbook",
  );
  write(
    "repo/packages/ai-plugins/common/skills/suiteskills/netsuite-suiteskills-finance/runbooks/netsuite-revenue-leakage/assets/dashboard.html",
    "<html></html>",
  );
  write("repo/packages/agent-skills/test/netsuite-fixture/SKILL.md", "fixture");
  write("repo/packages/other/helper-skill/SKILL.md", "not oracle's");

  const { skills, skippedFiles } = collectSkillFolders(repo, "", {
    skipDirNames: ["test"],
  });
  const bySlug = new Map(skills.map((skill) => [skill.slug, skill]));

  it("finds skills in both of Oracle's folders", () => {
    assert.ok(bySlug.has("netsuite-sdf-safe-guide"));
    assert.ok(bySlug.has("netsuite-suiteskills-finance"));
  });

  it("keeps SKILL.md whole past 32,000 characters", () => {
    assert.equal(
      bySlug.get("netsuite-sdf-safe-guide")?.markdown.length,
      LONG_SKILL.length,
    );
  });

  it("carries every text file in the folder, whole", () => {
    const files = bySlug.get("netsuite-sdf-safe-guide")?.files ?? [];
    assert.deepEqual(
      files.map((file) => file.path),
      ["references/05-security.md"],
    );
    assert.equal(files[0]?.content.length, 70_000);
    const finance = bySlug.get("netsuite-suiteskills-finance")?.files ?? [];
    assert.deepEqual(
      finance.map((file) => file.path),
      [
        "runbooks/netsuite-revenue-leakage/assets/dashboard.html",
        "runbooks/netsuite-revenue-leakage/RUNBOOK.md",
      ],
    );
  });

  it("reports files that are not text instead of dropping them silently", () => {
    assert.deepEqual(skippedFiles, ["netsuite-sdf-safe-guide/logo.png"]);
  });

  it("skips test folders", () => {
    assert.equal(bySlug.has("netsuite-fixture"), false);
  });

  it("keeps only netsuite- skills, first folder name wins", () => {
    const { pack, ignored, duplicates } = oracleSkillPack([
      ...skills,
      {
        slug: "netsuite-suiteskills-finance",
        relativeDir: "dist/copy",
        markdown: "copy",
      },
    ]);
    const ids = pack.map((skill) => skill.localId);
    assert.deepEqual(
      ids.sort((a, b) => a.localeCompare(b)),
      ["netsuite-sdf-safe-guide", "netsuite-suiteskills-finance"],
    );
    assert.equal(
      pack.find((skill) => skill.localId === "netsuite-suiteskills-finance")
        ?.markdown,
      bySlug.get("netsuite-suiteskills-finance")?.markdown,
    );
    assert.deepEqual(ignored, ["packages/other/helper-skill"]);
    assert.deepEqual(duplicates, ["dist/copy"]);
  });
});

describe("writeSkillPack", () => {
  it("drops a file the pack no longer has", () => {
    const dest = path.join(root, "written");
    writeSkillPack(dest, [
      {
        localId: "netsuite-a",
        markdown: "a",
        files: [{ path: "old.md", content: "old" }],
      },
    ]);
    writeSkillPack(dest, [
      {
        localId: "netsuite-a",
        markdown: "a",
        files: [{ path: "new.md", content: "new" }],
      },
    ]);
    assert.equal(existsSync(path.join(dest, "netsuite-a", "old.md")), false);
    assert.equal(
      readFileSync(path.join(dest, "netsuite-a", "new.md"), "utf8"),
      "new",
    );
  });
});

describe("listSkillPackFiles", () => {
  it("lists the top of the folder first and reports the total", () => {
    const dir = path.join(root, "listing");
    write("listing/index.json", "{}");
    for (let i = 0; i < 40; i += 1) {
      write(`listing/runbooks/r${String(i).padStart(2, "0")}/RUNBOOK.md`, "r");
    }
    const { files, total } = listSkillPackFiles(dir);
    assert.equal(total, 41);
    assert.equal(files.length, 32);
    assert.equal(files[0], "index.json");
  });
});

describe("oracleSkillName", () => {
  it("titles a SuiteSkill by its heading", () => {
    assert.equal(
      oracleSkillName(
        "netsuite-suiteskills-customers-sales",
        "netsuite-suiteskills-customers-sales",
        "# Customers & Sales\n\nbody",
      ),
      "SuiteSkills Customers & Sales",
    );
  });

  it("keeps the folder-derived name for every other Oracle skill", () => {
    assert.equal(
      oracleSkillName(
        "netsuite-sdf-safe-guide",
        "netsuite-sdf-safe-guide",
        "# SAFE",
      ),
      "Sdf Safe Guide",
    );
  });
});

describe("pageSkillFile", () => {
  it("returns a long file in pages", () => {
    const content = "z".repeat(SKILL_FILE_PAGE_CHARS + 10);
    const first = pageSkillFile(content);
    assert.equal(first.content.length, SKILL_FILE_PAGE_CHARS);
    assert.equal(first.nextOffset, SKILL_FILE_PAGE_CHARS);
    const second = pageSkillFile(content, first.nextOffset);
    assert.equal(second.content.length, 10);
    assert.equal(second.nextOffset, undefined);
    assert.equal(second.totalChars, content.length);
  });
});

describe("Oracle pack on disk", () => {
  const packDir = path.join(root, "oracle-skills");
  process.env.ORACLE_SKILLS_DIR = packDir;
  process.env.COMMUNITY_SKILLS_DIR = path.join(root, "community-skills");
  writeSkillPack(packDir, [
    {
      localId: "netsuite-ai-connector-instructions",
      markdown: "---\nname: netsuite-ai-connector-instructions\n---\n\nrules",
    },
    {
      localId: "netsuite-sdf-safe-guide",
      markdown: LONG_SKILL,
      files: [{ path: "references/05-security.md", content: "security" }],
    },
    {
      localId: "netsuite-sdf-roles-and-permissions",
      markdown: "---\nname: netsuite-sdf-roles-and-permissions\n---\n\nroles",
      files: [{ path: "references/permissions.json", content: '{"perm":1}' }],
    },
    {
      localId: "netsuite-suitescript-upgrade",
      markdown: `---\nname: netsuite-suitescript-upgrade\n---\n\n${"u".repeat(30_000)}`,
    },
    {
      localId: "netsuite-suiteskills-finance",
      markdown: `---\nname: netsuite-suiteskills-finance\n---\n\n# Finance\n\n${"f".repeat(14_000)}`,
    },
  ]);

  const read = (skillId: string, filePath: string) =>
    readPackSkillFile(
      filePath,
      skillId,
      (folder) => folder,
      oracleSkillDir,
      getOracleSkillContent,
    );

  it("reads a skill's own file", () => {
    assert.equal(
      read("netsuite-sdf-safe-guide", "references/05-security.md"),
      "security",
    );
  });

  it("follows a link into a sibling skill, with or without ../", () => {
    assert.equal(
      read(
        "netsuite-sdf-safe-guide",
        "../netsuite-sdf-roles-and-permissions/references/permissions.json",
      ),
      '{"perm":1}',
    );
    assert.equal(
      read(
        "netsuite-sdf-safe-guide",
        "netsuite-sdf-roles-and-permissions/SKILL.md",
      ),
      "roles",
    );
  });

  it("refuses a path out of the pack", () => {
    assert.equal(read("netsuite-sdf-safe-guide", "../../etc/passwd"), null);
    assert.equal(read("netsuite-sdf-safe-guide", "../../../SKILL.md"), null);
  });

  it("injects a SuiteSkill whole and says how to read on past the limit", () => {
    const section = buildSkillsPromptSection({
      enabledSkillIds: [
        "netsuite-sdf-safe-guide",
        "netsuite-suiteskills-finance",
      ],
      skillModes: {},
      customSkills: [],
      connectedSkillSources: [],
    });
    assert.ok(section.includes("### SuiteSkills Finance"));
    assert.ok(section.includes("f".repeat(14_000)));
    assert.ok(
      section.includes(
        `[Cut at ${MAX_OPTIONAL_SKILL_CHARS} of 40000 characters. Read the rest with the readSkillFile tool: skill "Sdf Safe Guide", path "SKILL.md", offset ${MAX_OPTIONAL_SKILL_CHARS}.]`,
      ),
    );
    assert.ok(
      section.includes("Files in Sdf Safe Guide: references/05-security.md."),
    );
  });

  it("names a skill left out for the context budget", () => {
    const section = buildSkillsPromptSection({
      enabledSkillIds: [
        "netsuite-sdf-safe-guide",
        "netsuite-suitescript-upgrade",
        "netsuite-suiteskills-finance",
      ],
      skillModes: {},
      customSkills: [],
      connectedSkillSources: [],
    });
    // 15,000 + 15,000 + 14,000 does not fit 40,000; the last one is named.
    assert.match(
      section,
      /Left out of this turn to fit the context budget: SuiteSkills Finance\./,
    );
  });
});
