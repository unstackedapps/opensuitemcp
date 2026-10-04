import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildSkillsPromptSection,
  normalizeUserSkillSettings,
} from "./catalog";

/**
 * A persona carries its paired skills into the turn by passing their ids
 * alongside the ones the composer invoked. This pins the mechanism the chat
 * route relies on: without it, pairing a `slash` skill would inject nothing
 * and the failure would be silent.
 */
const SKILL_ID = "paired-skill";
const BODY = "Check the eliminating entries before posting.";

function settings(mode: "slash" | "auto" | "off") {
  return normalizeUserSkillSettings({
    enabledSkillIds: [],
    skillModes: { [SKILL_ID]: mode },
    customSkills: [
      {
        id: SKILL_ID,
        name: "Intercompany JE Review",
        content: BODY,
        updatedAt: "2026-09-27T00:00:00.000Z",
        authoredBy: "agent",
      },
    ],
  });
}

describe("a persona carries its paired skills into the turn", () => {
  it("leaves a slash skill out of an unrelated turn", () => {
    const section = buildSkillsPromptSection(settings("slash"), {
      invokedConnectedSkillIds: [],
    });
    assert.ok(!section.includes(BODY));
  });

  it("injects it once the persona's id list carries it", () => {
    const section = buildSkillsPromptSection(settings("slash"), {
      invokedConnectedSkillIds: [SKILL_ID],
    });
    assert.ok(section.includes(BODY));
  });

  it("applies an auto skill with or without the pairing", () => {
    for (const ids of [[], [SKILL_ID]]) {
      const section = buildSkillsPromptSection(settings("auto"), {
        invokedConnectedSkillIds: ids,
      });
      assert.ok(section.includes(BODY));
    }
  });

  it("still honors a skill its owner switched off", () => {
    const section = buildSkillsPromptSection(settings("off"), {
      invokedConnectedSkillIds: [SKILL_ID],
    });
    assert.ok(!section.includes(BODY));
  });

  it("is what the chat route actually passes down", () => {
    const route = readFileSync(
      new URL("../../../app/api/chat/route.ts", import.meta.url),
      "utf8",
    );
    assert.ok(
      route.includes("const personaSkillIds = pairedSkillIdsFor("),
      "chat route resolves the active persona's skills from the map",
    );
    assert.ok(
      route.includes("normalizePersonaSkillIds(settings.personaSkillIds)"),
      "chat route reads the stored pairing map",
    );
    assert.equal(
      route.match(/invokedConnectedSkillIds: turnSkillIds/g)?.length,
      3,
      "prompt section, enabled names, and turn chips all see the pairing",
    );
  });
});
