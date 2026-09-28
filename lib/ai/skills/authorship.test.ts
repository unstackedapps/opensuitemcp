import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { z } from "zod";
import { normalizeUserSkillSettings } from "./catalog";

/**
 * The Skills panel PUTs the whole custom skill list on every save, so a field
 * the settings schema does not name is dropped from every entry. That is how
 * agent-written personas were once unstamped — the guardrail then read them as
 * person-written, and the agent that wrote one could no longer revise it.
 *
 * Mirrors app/api/settings/route.ts; the last case reads the route itself, so
 * removing the field there fails this file rather than shipping quietly.
 */
const customSkillSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().max(200),
  content: z.string().max(32_000),
  updatedAt: z.string().optional(),
  enabled: z.boolean().optional(),
  slug: z.string().max(64).optional(),
  authoredBy: z.literal("agent").optional(),
});

const agentWritten = {
  id: "s1",
  name: "Intercompany JE Review",
  content: "Check the eliminating entries before posting.",
  updatedAt: "2026-09-27T00:00:00.000Z",
  authoredBy: "agent" as const,
};

function saved(entries: unknown[]) {
  return normalizeUserSkillSettings({
    customSkills: entries.map((entry) => customSkillSchema.parse(entry)),
  }).customSkills;
}

describe("skill authorship survives a settings save", () => {
  it("keeps the stamp through the settings schema", () => {
    assert.equal(customSkillSchema.parse(agentWritten).authoredBy, "agent");
  });

  it("keeps it through schema then normalization, as the route does", () => {
    assert.equal(saved([agentWritten])[0].authoredBy, "agent");
  });

  it("leaves a person-written skill unstamped", () => {
    const { authoredBy, ...personWritten } = agentWritten;
    assert.equal(saved([personWritten])[0].authoredBy, undefined);
  });

  it("rejects an authorship value it does not recognise", () => {
    assert.throws(() =>
      customSkillSchema.parse({ ...agentWritten, authoredBy: "somebody" }),
    );
  });

  it("does not let one entry's save unstamp another", () => {
    const list = saved([
      agentWritten,
      { ...agentWritten, id: "s2", authoredBy: undefined },
    ]);
    assert.equal(list[0].authoredBy, "agent");
    assert.equal(list[1].authoredBy, undefined);
  });

  it("names both new fields in the settings route itself", () => {
    const route = readFileSync(
      new URL("../../../app/api/settings/route.ts", import.meta.url),
      "utf8",
    );
    const skillSchema = route.slice(
      route.indexOf("const customSkillSchema"),
      route.indexOf("const customPersonaSchema"),
    );
    const personaSchema = route.slice(
      route.indexOf("const customPersonaSchema"),
      route.indexOf("const settingsSchema"),
    );
    assert.ok(skillSchema.includes("authoredBy"), "customSkillSchema");
    assert.ok(personaSchema.includes("authoredBy"), "customPersonaSchema");
    assert.ok(personaSchema.includes("skillIds"), "persona pairing");
  });
});
