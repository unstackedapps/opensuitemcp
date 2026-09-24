import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { normalizeCustomPersonas } from "./catalog";

/**
 * The settings route accepts the whole persona list on every save, so a field
 * the schema does not name is dropped from every entry. That happened to
 * authoredBy: saving anything in the Personas panel unstamped every
 * agent-written persona, and the guardrail then read them as person-written —
 * so the agent that wrote one could no longer revise it.
 *
 * Mirrors app/api/settings/route.ts. If the two drift, this fails.
 */
const customPersonaSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().max(200),
  shortName: z.string().max(40).optional(),
  primaryRole: z.string().max(300).optional(),
  content: z.string().max(32_000),
  updatedAt: z.string().optional(),
  authoredBy: z.literal("agent").optional(),
});

const agentWritten = {
  id: "p1",
  name: "AP Close Specialist",
  shortName: "AP Close",
  content: "Work the payables close.",
  updatedAt: "2026-09-24T00:00:00.000Z",
  authoredBy: "agent" as const,
};

describe("persona authorship survives a settings save", () => {
  it("keeps the stamp through the settings schema", () => {
    const parsed = customPersonaSchema.parse(agentWritten);
    assert.equal(parsed.authoredBy, "agent");
  });

  it("keeps it through schema then normalization, as the route does", () => {
    const [normalized] = normalizeCustomPersonas([
      customPersonaSchema.parse(agentWritten),
    ]);
    assert.equal(normalized.authoredBy, "agent");
  });

  it("leaves a person-written persona unstamped", () => {
    const { authoredBy, ...personWritten } = agentWritten;
    const [normalized] = normalizeCustomPersonas([
      customPersonaSchema.parse(personWritten),
    ]);
    assert.equal(normalized.authoredBy, undefined);
  });

  it("rejects an authorship value it does not recognise", () => {
    assert.throws(() =>
      customPersonaSchema.parse({ ...agentWritten, authoredBy: "somebody" }),
    );
  });

  it("does not let one entry's save unstamp another", () => {
    const list = [
      agentWritten,
      { ...agentWritten, id: "p2", authoredBy: undefined },
    ];
    const saved = normalizeCustomPersonas(
      list.map((entry) => customPersonaSchema.parse(entry)),
    );
    assert.equal(saved[0].authoredBy, "agent");
    assert.equal(saved[1].authoredBy, undefined);
  });
});
