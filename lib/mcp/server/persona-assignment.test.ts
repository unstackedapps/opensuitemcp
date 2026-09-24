import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AVA_PERSONA_ID } from "@/lib/ai/personas/ids";
import { resolveAssignedPersona } from "./persona-assignment";

const custom = {
  id: "p-agent",
  name: "AP Close Specialist",
  shortName: "AP Close",
  primaryRole: "Month-end payables",
  content: "Work the payables close.",
  updatedAt: "2026-09-23T00:00:00.000Z",
  authoredBy: "agent" as const,
};

describe("resolveAssignedPersona", () => {
  it("falls back to Ava when a key has no assignment", () => {
    const persona = resolveAssignedPersona(null, []);
    assert.equal(persona.id, AVA_PERSONA_ID);
    assert.equal(persona.source, "ava");
  });

  it("falls back to Ava when the assigned persona was deleted", () => {
    const persona = resolveAssignedPersona("p-agent", []);
    assert.equal(persona.id, AVA_PERSONA_ID);
  });

  it("returns the assigned custom persona while it exists", () => {
    const persona = resolveAssignedPersona("p-agent", [custom]);
    assert.equal(persona.id, "p-agent");
    assert.equal(persona.name, custom.name);
    assert.equal(persona.source, "custom");
  });

  it("returns an assigned builtin", () => {
    const persona = resolveAssignedPersona("netsuite-administrator", []);
    assert.equal(persona.id, "netsuite-administrator");
    assert.equal(persona.source, "builtin");
  });

  it("treats Ava's own id as an assignment, not a fallback", () => {
    const persona = resolveAssignedPersona(AVA_PERSONA_ID, [custom]);
    assert.equal(persona.id, AVA_PERSONA_ID);
  });

  it("never returns an empty name", () => {
    for (const id of [null, undefined, "", "does-not-exist"]) {
      assert.ok(resolveAssignedPersona(id, []).name.length > 0);
    }
  });
});
