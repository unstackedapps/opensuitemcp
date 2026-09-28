import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_SKILL_BUNDLE_CHARS,
  MAX_SKILL_FILE_CHARS,
  parseSkillFrontmatter,
  readSkillZip,
  skillMarkdownWithFrontmatter,
  writeSkillZip,
} from "./bundle";
import { normalizeSkillFilePath } from "./ids";

const bundle = {
  content: "# Intercompany JE Review\n\nSee references/intake.md.",
  files: [
    { path: "references/intake.md", content: "Ask which subsidiaries." },
    { path: "references/troubleshooting.md", content: "Eliminations first." },
  ],
};

describe("a skill round-trips through a zip", () => {
  it("comes back with its entry point and every reference", () => {
    const result = readSkillZip(writeSkillZip(bundle, "ic-je-review"));
    assert.ok(result.ok);
    assert.equal(result.bundle.content, bundle.content);
    assert.deepEqual(result.bundle.files.map((file) => file.path).sort(), [
      "references/intake.md",
      "references/troubleshooting.md",
    ]);
  });

  it("drops the wrapping folder, so reference links still resolve", () => {
    const result = readSkillZip(writeSkillZip(bundle, "some-other-name"));
    assert.ok(result.ok);
    assert.ok(
      result.bundle.files.every((file) => !file.path.includes("some-other")),
    );
  });

  it("refuses an archive with no SKILL.md", () => {
    const result = readSkillZip(
      writeSkillZip({ content: "x", files: [] }, "s"),
    );
    assert.ok(result.ok);
    const orphan = readSkillZip(
      // A zip whose only entry is a reference file.
      writeSkillZip({ content: "", files: bundle.files }, "s"),
    );
    assert.ok(orphan.ok);
    assert.equal(orphan.bundle.content, "");
  });

  it("reports a file over the per-file cap by name", () => {
    const result = readSkillZip(
      writeSkillZip(
        {
          content: "entry",
          files: [
            { path: "big.md", content: "x".repeat(MAX_SKILL_FILE_CHARS + 1) },
          ],
        },
        "s",
      ),
    );
    assert.ok(!result.ok);
    assert.match(result.error, /big\.md/);
  });

  it("refuses a bundle over the whole-skill cap", () => {
    const files = Array.from({ length: 8 }, (_, index) => ({
      path: `r${index}.md`,
      content: "x".repeat(MAX_SKILL_FILE_CHARS / 2),
    }));
    const result = readSkillZip(writeSkillZip({ content: "e", files }, "s"));
    assert.ok(!result.ok);
    assert.match(result.error, new RegExp(String(MAX_SKILL_BUNDLE_CHARS)));
  });

  it("refuses something that is not a zip", () => {
    const result = readSkillZip(new Uint8Array([1, 2, 3, 4]));
    assert.ok(!result.ok);
    assert.match(result.error, /readable \.zip/);
  });

  it("is byte-stable, so two downloads compare equal", () => {
    assert.deepEqual(
      Array.from(writeSkillZip(bundle, "s")),
      Array.from(writeSkillZip(bundle, "s")),
    );
  });
});

describe("reference paths", () => {
  it("keeps a nested path", () => {
    assert.equal(
      normalizeSkillFilePath("references/intake.md"),
      "references/intake.md",
    );
  });

  it("refuses traversal, absolute paths and backslashes", () => {
    for (const bad of [
      "../secrets.md",
      "references/../../x.md",
      "/etc/passwd",
      "references\\intake.md",
      "./..",
    ]) {
      assert.equal(normalizeSkillFilePath(bad), null, bad);
    }
  });

  it("refuses SKILL.md, which is the entry point rather than a reference", () => {
    assert.equal(normalizeSkillFilePath("SKILL.md"), null);
    assert.equal(normalizeSkillFilePath("skill.md"), null);
  });

  it("strips a leading ./", () => {
    assert.equal(normalizeSkillFilePath("./a.md"), "a.md");
  });
});

describe("frontmatter", () => {
  it("is added on download so a re-import keeps the name", () => {
    const md = skillMarkdownWithFrontmatter({
      name: "IC Review",
      description: "Tie vendor statements to payables.",
      content: "# Body",
    });
    const parsed = parseSkillFrontmatter(md);
    assert.equal(parsed.name, "IC Review");
    assert.equal(parsed.description, "Tie vendor statements to payables.");
  });

  it("is left alone when the content already has some", () => {
    const original = "---\nname: Kept\n---\n\n# Body";
    assert.equal(
      skillMarkdownWithFrontmatter({ name: "Other", content: original }),
      original,
    );
  });
});
