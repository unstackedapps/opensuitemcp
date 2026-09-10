/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySkillModeChange,
  isSlashableMode,
  normalizeSkillModes,
  resolveSkillMode,
  shouldInjectSkillForTurn,
  slugifySkillName,
} from "./modes";

describe("skill invocation modes", () => {
  it("normalizes stored modes and ignores junk", () => {
    assert.deepEqual(
      normalizeSkillModes({
        "netsuite-foo": "auto",
        "community:bar": "slash",
        skip: "nope",
        "": "off",
      }),
      {
        "netsuite-foo": "auto",
        "community:bar": "slash",
      },
    );
    assert.deepEqual(normalizeSkillModes(null), {});
    assert.deepEqual(normalizeSkillModes(["auto"]), {});
  });

  it("slugifies names for slash tokens", () => {
    assert.equal(slugifySkillName("SuiteQL Expert"), "suiteql-expert");
    assert.equal(slugifySkillName("  ***  "), "skill");
  });

  it("resolves legacy catalog, custom, and connected defaults", () => {
    assert.equal(
      resolveSkillMode({
        skillId: "always",
        kind: "oracle",
        alwaysOn: true,
        skillModes: { always: "off" },
        enabledSkillIds: [],
      }),
      "auto",
    );
    assert.equal(
      resolveSkillMode({
        skillId: "oracle-a",
        kind: "oracle",
        skillModes: {},
        enabledSkillIds: ["oracle-a"],
      }),
      "auto",
    );
    assert.equal(
      resolveSkillMode({
        skillId: "oracle-b",
        kind: "oracle",
        skillModes: {},
        enabledSkillIds: [],
      }),
      "off",
    );
    assert.equal(
      resolveSkillMode({
        skillId: "custom-1",
        kind: "custom",
        skillModes: {},
        enabledSkillIds: [],
        customEnabled: true,
      }),
      "auto",
    );
    assert.equal(
      resolveSkillMode({
        skillId: "custom-2",
        kind: "custom",
        skillModes: {},
        enabledSkillIds: [],
        customEnabled: false,
      }),
      "off",
    );
    assert.equal(
      resolveSkillMode({
        skillId: "connected:src:slug",
        kind: "connected",
        skillModes: {},
        enabledSkillIds: [],
      }),
      "slash",
    );
    assert.equal(
      resolveSkillMode({
        skillId: "oracle-a",
        kind: "oracle",
        skillModes: { "oracle-a": "auto" },
        enabledSkillIds: [],
      }),
      "off",
    );
    assert.equal(
      resolveSkillMode({
        skillId: "oracle-a",
        kind: "oracle",
        skillModes: { "oracle-a": "slash" },
        enabledSkillIds: ["oracle-a"],
      }),
      "slash",
    );
  });

  it("injects auto always and slash only when invoked", () => {
    assert.equal(shouldInjectSkillForTurn("auto", "a", []), true);
    assert.equal(shouldInjectSkillForTurn("slash", "a", []), false);
    assert.equal(shouldInjectSkillForTurn("slash", "a", ["a"]), true);
    assert.equal(shouldInjectSkillForTurn("off", "a", ["a"]), false);
    assert.equal(isSlashableMode("auto"), true);
    assert.equal(isSlashableMode("off"), false);
  });

  it("keeps enabledSkillIds in sync when the mode changes", () => {
    const next = applySkillModeChange({
      skillId: "oracle-a",
      kind: "oracle",
      mode: "slash",
      skillModes: {},
      enabledSkillIds: ["oracle-a", "oracle-b"],
      customSkills: [],
    });
    assert.equal(next.skillModes["oracle-a"], "slash");
    assert.deepEqual(next.enabledSkillIds, ["oracle-b"]);

    const auto = applySkillModeChange({
      skillId: "oracle-a",
      kind: "oracle",
      mode: "auto",
      skillModes: next.skillModes,
      enabledSkillIds: next.enabledSkillIds,
      customSkills: [],
    });
    assert.deepEqual(auto.enabledSkillIds, ["oracle-b", "oracle-a"]);

    const custom = applySkillModeChange({
      skillId: "c1",
      kind: "custom",
      mode: "slash",
      skillModes: {},
      enabledSkillIds: [],
      customSkills: [{ id: "c1", enabled: true }],
    });
    assert.equal(custom.customSkills[0]?.enabled, false);
    assert.equal(custom.skillModes.c1, "slash");
  });
});
