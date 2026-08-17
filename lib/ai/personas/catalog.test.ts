import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AVA_PERSONA_ID,
  isBuiltinPersonaId,
  isPersonaBuilderId,
  isValidPersonaId,
  listBuiltinPersonas,
  normalizeCustomPersonas,
  PERSONA_BUILDER_ID,
  resolvePersona,
} from "./catalog";
import { clientPersonaShortName } from "./ids";
import {
  emptyPersonaInterviewState,
  isPersonaInterviewComplete,
  mergePersonaInterviewCoverage,
  normalizePersonaInterviewState,
} from "./interview";

describe("personas catalog", () => {
  it("lists Ava plus disk builtins", () => {
    const list = listBuiltinPersonas();
    assert.ok(list.some((p) => p.id === AVA_PERSONA_ID));
    assert.ok(list.some((p) => p.id === "netsuite-administrator"));
    assert.ok(list.some((p) => p.id === "suiteql-data-analyst"));
    const admin = list.find((p) => p.id === "netsuite-administrator");
    assert.ok(admin?.body?.includes("NetSuite Administrator"));
  });

  it("resolves Ava for null / empty / unknown", () => {
    assert.equal(resolvePersona({ personaId: null }).id, AVA_PERSONA_ID);
    assert.equal(resolvePersona({ personaId: "" }).id, AVA_PERSONA_ID);
    assert.equal(
      resolvePersona({ personaId: "deleted-custom" }).id,
      AVA_PERSONA_ID,
    );
    assert.equal(resolvePersona({ personaId: null }).instructions, null);
  });

  it("resolves builder as system interviewer", () => {
    const builder = resolvePersona({ personaId: PERSONA_BUILDER_ID });
    assert.equal(builder.id, PERSONA_BUILDER_ID);
    assert.equal(builder.source, "system");
    assert.equal(builder.instructions, null);
    assert.equal(isPersonaBuilderId(PERSONA_BUILDER_ID), true);
    assert.equal(isValidPersonaId(PERSONA_BUILDER_ID), true);
  });

  it("resolves builtin with full body and SuiteQL confirm flag", () => {
    const analyst = resolvePersona({ personaId: "suiteql-data-analyst" });
    assert.equal(analyst.id, "suiteql-data-analyst");
    assert.ok(analyst.instructions?.includes("SuiteQL"));
    assert.equal(analyst.confirmBeforeSuiteQL, false);

    const admin = resolvePersona({ personaId: "netsuite-administrator" });
    assert.equal(admin.confirmBeforeSuiteQL, true);
  });

  it("resolves custom personas with shortName and validates ids", () => {
    const custom = [
      {
        id: "my-persona",
        name: "My Persona",
        shortName: "Mine",
        primaryRole: "Custom tester",
        content: "Be terse.",
        updatedAt: new Date().toISOString(),
      },
    ];
    const resolved = resolvePersona({
      personaId: "my-persona",
      customPersonas: custom,
    });
    assert.equal(resolved.id, "my-persona");
    assert.equal(resolved.shortName, "Mine");
    assert.equal(resolved.primaryRole, "Custom tester");
    assert.equal(resolved.instructions, "Be terse.");
    assert.equal(isValidPersonaId("my-persona", custom), true);
    assert.equal(isValidPersonaId("nope", custom), false);
    assert.equal(isValidPersonaId(AVA_PERSONA_ID), true);
    assert.equal(isValidPersonaId(null), true);
  });

  it("rejects custom ids that collide with builtins or builder", () => {
    const normalized = normalizeCustomPersonas([
      {
        id: "ava",
        name: "Fake Ava",
        content: "x",
        updatedAt: "2020-01-01",
      },
      {
        id: PERSONA_BUILDER_ID,
        name: "Fake Builder",
        content: "x",
        updatedAt: "2020-01-01",
      },
      {
        id: "ok-custom",
        name: "Ok Custom Name",
        content: "y",
        updatedAt: "2020-01-01",
      },
    ]);
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0]?.id, "ok-custom");
    assert.equal(normalized[0]?.shortName, "Ok");
  });

  it("exposes client-safe short names", () => {
    assert.equal(clientPersonaShortName(null), "Ava");
    assert.equal(clientPersonaShortName("financial-controller"), "Controller");
    assert.equal(clientPersonaShortName(PERSONA_BUILDER_ID), "Interview");
    assert.equal(clientPersonaShortName("gone"), "Persona");
    assert.equal(isBuiltinPersonaId("netsuite-auditor"), true);
  });
});

describe("persona interview coverage", () => {
  it("starts empty and completes when all dimensions covered", () => {
    const empty = emptyPersonaInterviewState();
    assert.equal(empty.covered.length, 0);
    assert.equal(empty.missing.length, 7);
    assert.equal(isPersonaInterviewComplete(empty), false);

    const merged = mergePersonaInterviewCoverage(empty, [
      "role",
      "domains",
      "tasks",
      "risk",
      "approaches",
      "tone",
      "constraints",
    ]);
    assert.equal(isPersonaInterviewComplete(merged), true);
    assert.deepEqual(normalizePersonaInterviewState(merged).missing, []);
  });
});
