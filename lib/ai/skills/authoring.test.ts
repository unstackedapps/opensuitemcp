import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agentMayModifySkill,
  MAX_CUSTOM_SKILL_CONTENT,
  MAX_CUSTOM_SKILL_NAME,
  readAgentSkillMode,
  readSkillDraft,
  skillWriteRefusal,
} from "./authoring";
import { ORG_CUSTOM_SKILL_ID_PREFIX } from "./ids";

const valid = {
  name: "Intercompany JE Review",
  content: "Check the eliminating entries before posting.",
  mode: undefined,
};

describe("readSkillDraft", () => {
  it("defaults to slash, so a written skill stays off every chat turn", () => {
    const result = readSkillDraft(valid);
    assert.ok(result.ok);
    assert.equal(result.draft.mode, "slash");
  });

  it("takes auto when the agent asks for it", () => {
    const result = readSkillDraft({ ...valid, mode: "auto" });
    assert.ok(result.ok);
    assert.equal(result.draft.mode, "auto");
  });

  it("never returns off — switching a skill off is the person's call", () => {
    assert.equal(readAgentSkillMode("off"), "slash");
    assert.equal(readAgentSkillMode(null), "slash");
  });

  it("trims and rejects an empty name", () => {
    const result = readSkillDraft({ ...valid, name: "   " });
    assert.ok(!result.ok);
    assert.match(result.error, /`name`/);
  });

  it("rejects empty content", () => {
    const result = readSkillDraft({ ...valid, content: "" });
    assert.ok(!result.ok);
    assert.match(result.error, /`content`/);
  });

  it("rejects a name past the cap the Skills panel saves under", () => {
    const result = readSkillDraft({
      ...valid,
      name: "x".repeat(MAX_CUSTOM_SKILL_NAME + 1),
    });
    assert.ok(!result.ok);
    assert.match(result.error, /200/);
  });

  it("reports the actual length when content is too long", () => {
    const content = "x".repeat(MAX_CUSTOM_SKILL_CONTENT + 5);
    const result = readSkillDraft({ ...valid, content });
    assert.ok(!result.ok);
    assert.match(result.error, new RegExp(String(content.length)));
  });

  it("accepts content exactly at the cap", () => {
    const result = readSkillDraft({
      ...valid,
      content: "x".repeat(MAX_CUSTOM_SKILL_CONTENT),
    });
    assert.ok(result.ok);
  });
});

describe("agentMayModifySkill", () => {
  it("allows a skill the agent wrote", () => {
    assert.equal(
      agentMayModifySkill({ id: "s1", name: "S", authoredBy: "agent" }),
      true,
    );
  });

  it("refuses a person-written skill", () => {
    const skill = { id: "s1", name: "Close checklist" };
    assert.equal(agentMayModifySkill(skill), false);
    assert.match(skillWriteRefusal(skill), /written by a person/);
  });

  it("refuses an org skill even when it carries the agent stamp", () => {
    const skill = {
      id: `${ORG_CUSTOM_SKILL_ID_PREFIX}abc`,
      name: "Org policy",
      authoredBy: "agent" as const,
    };
    assert.equal(agentMayModifySkill(skill), false);
    assert.match(skillWriteRefusal(skill), /administrator/);
  });

  it("refuses an org skill flagged without the id prefix", () => {
    assert.equal(
      agentMayModifySkill({
        id: "s1",
        name: "Org policy",
        authoredBy: "agent",
        managedByOrg: true,
      }),
      false,
    );
  });
});
