import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detachSkillEverywhere,
  MAX_PAIRED_SKILL_IDS,
  normalizePairedSkillIds,
  normalizePersonaSkillIds,
  pairedSkillIdsFor,
  personasCarryingSkill,
  prunePairedSkillIds,
  prunePersonaSkillIds,
  removePersonaPairings,
  setPairedSkillIds,
} from "./pairing";

describe("normalizePairedSkillIds", () => {
  it("keeps order and drops duplicates", () => {
    assert.deepEqual(normalizePairedSkillIds(["b", "a", "b"]), ["b", "a"]);
  });

  it("drops blanks, non-strings and over-long ids", () => {
    assert.deepEqual(
      normalizePairedSkillIds(["a", "  ", 7, null, "x".repeat(129)]),
      ["a"],
    );
  });

  it("trims", () => {
    assert.deepEqual(normalizePairedSkillIds([" a "]), ["a"]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 40 }, (_, index) => `s${index}`);
    assert.equal(normalizePairedSkillIds(many).length, MAX_PAIRED_SKILL_IDS);
  });

  it("returns empty for anything that is not an array", () => {
    assert.deepEqual(normalizePairedSkillIds("a"), []);
    assert.deepEqual(normalizePairedSkillIds(undefined), []);
  });
});

describe("normalizePersonaSkillIds", () => {
  it("keeps a persona's list", () => {
    assert.deepEqual(normalizePersonaSkillIds({ ava: ["s1", "s2"] }), {
      ava: ["s1", "s2"],
    });
  });

  it("stores a persona carrying nothing as absent", () => {
    assert.deepEqual(normalizePersonaSkillIds({ ava: [] }), {});
  });

  it("drops junk without dropping its neighbours", () => {
    assert.deepEqual(
      normalizePersonaSkillIds({ ava: "nope", "p-1": ["s1", 9] }),
      { "p-1": ["s1"] },
    );
  });

  it("returns empty for a non-object", () => {
    assert.deepEqual(normalizePersonaSkillIds(["a"]), {});
    assert.deepEqual(normalizePersonaSkillIds(null), {});
  });
});

describe("reading and writing one persona's pairings", () => {
  const map = { ava: ["s1"], "p-1": ["s1", "s2"] };

  it("reads a builtin id the same way as a custom one", () => {
    assert.deepEqual(pairedSkillIdsFor(map, "ava"), ["s1"]);
    assert.deepEqual(pairedSkillIdsFor(map, "p-1"), ["s1", "s2"]);
  });

  it("reads nothing for an unpaired or absent persona", () => {
    assert.deepEqual(pairedSkillIdsFor(map, "p-9"), []);
    assert.deepEqual(pairedSkillIdsFor(map, null), []);
  });

  it("replaces a persona's set without touching the others", () => {
    const next = setPairedSkillIds(map, "ava", ["s3"]);
    assert.deepEqual(next.ava, ["s3"]);
    assert.deepEqual(next["p-1"], ["s1", "s2"]);
  });

  it("removes the entry when the set is emptied", () => {
    assert.equal(setPairedSkillIds(map, "ava", []).ava, undefined);
  });

  it("does not mutate the map it was given", () => {
    setPairedSkillIds(map, "ava", ["s9"]);
    assert.deepEqual(map.ava, ["s1"]);
  });
});

describe("deleting one end of a pairing", () => {
  const map = { ava: ["s1"], "p-1": ["s1", "s2"] };

  it("a deleted persona takes its pairings and leaves the skills", () => {
    const next = removePersonaPairings(map, "p-1");
    assert.equal(next["p-1"], undefined);
    assert.deepEqual(next.ava, ["s1"]);
  });

  it("a deleted skill is released by every persona carrying it", () => {
    const next = detachSkillEverywhere(map, "s1");
    assert.equal(next.ava, undefined);
    assert.deepEqual(next["p-1"], ["s2"]);
  });

  it("names the personas carrying a skill", () => {
    assert.deepEqual(personasCarryingSkill(map, "s1"), ["ava", "p-1"]);
    assert.deepEqual(personasCarryingSkill(map, "s2"), ["p-1"]);
    assert.deepEqual(personasCarryingSkill(map, "s9"), []);
  });
});

describe("pruning against the skills that still exist", () => {
  it("drops a pairing whose skill is gone", () => {
    assert.deepEqual(prunePairedSkillIds(["a", "b"], ["b"]), ["b"]);
  });

  it("prunes the whole map and forgets emptied personas", () => {
    assert.deepEqual(
      prunePersonaSkillIds({ ava: ["s1"], "p-1": ["s1", "s2"] }, ["s2"]),
      { "p-1": ["s2"] },
    );
  });
});
