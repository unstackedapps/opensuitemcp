import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  PERSONA_PLAYBOOK_SECTIONS,
  personaPlaybookOutline,
  personaPlaybookOutlineInline,
} from "./playbook-shape";

/**
 * The shape is only worth stating if the personas that ship actually follow
 * it. A builtin that drifts makes the instruction a lie for every agent that
 * reads one as its example.
 */
describe("persona playbook shape", () => {
  it("matches the builtin persona that agents are pointed at", () => {
    const body = readFileSync(
      path.join(process.cwd(), ".personas", "02-suiteql-data-analyst.md"),
      "utf8",
    );
    for (const section of ["Persona Metadata", "Persona Instructions"]) {
      assert.ok(
        body.includes(`## ${section}`),
        `builtin is missing "## ${section}"`,
      );
    }
    for (const field of [
      "Name:",
      "Short Name:",
      "Primary Role:",
      "Default Risk Posture:",
    ]) {
      assert.ok(body.includes(field), `builtin is missing "${field}"`);
    }
  });

  it("names every section in both renderings", () => {
    const outline = personaPlaybookOutline();
    const inline = personaPlaybookOutlineInline();
    for (const section of PERSONA_PLAYBOOK_SECTIONS) {
      assert.ok(outline.includes(section.heading));
      assert.ok(inline.includes(section.heading));
    }
  });

  it("renders the outline one section per line", () => {
    assert.equal(
      personaPlaybookOutline().split("\n").length,
      PERSONA_PLAYBOOK_SECTIONS.length,
    );
  });
});
