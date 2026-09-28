import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * experimental_activeTools is an allowlist, not a hint.
 *
 * A tool registered in the tool map and left out of that list is hidden from
 * the model entirely — so a skill whose instructions name readSkillFile got
 * "I do not have a readSkillFile tool available", which is what a live turn
 * against the sandbox actually returned.
 */
const route = readFileSync(
  new URL("../../../app/api/chat/route.ts", import.meta.url),
  "utf8",
);

describe("a registered chat tool is also an active one", () => {
  it("registers readSkillFile in the tool map", () => {
    assert.match(route, /readSkillFile: createReadSkillFileTool\(/);
  });

  it("names it in the activeTools allowlist as well", () => {
    const base = route.slice(
      route.indexOf("const baseToolNames"),
      route.indexOf("const activeTools"),
    );
    assert.ok(
      base.includes('"readSkillFile"'),
      "readSkillFile must be in baseToolNames, or the model cannot see it",
    );
  });

  it("keeps the tools the allowlist already carried", () => {
    const base = route.slice(
      route.indexOf("const baseToolNames"),
      route.indexOf("const activeTools"),
    );
    for (const name of ["readWebpage", "getCurrentConfig"]) {
      assert.ok(base.includes(`"${name}"`), name);
    }
  });
});
