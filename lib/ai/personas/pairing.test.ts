import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCustomPersonas } from "./catalog";
import {
  MAX_PAIRED_SKILL_IDS,
  normalizePairedSkillIds,
  prunePairedSkillIds,
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

describe("prunePairedSkillIds", () => {
  it("drops a pairing whose skill is gone", () => {
    assert.deepEqual(prunePairedSkillIds(["a", "b"], ["b"]), ["b"]);
  });
});

describe("persona pairing survives normalization", () => {
  const persona = {
    id: "p1",
    name: "AP Close Specialist",
    shortName: "AP Close",
    content: "Work the payables close.",
    updatedAt: "2026-09-27T00:00:00.000Z",
    authoredBy: "agent" as const,
    skillIds: ["s1", "s2"],
  };

  it("keeps the paired ids", () => {
    const [normalized] = normalizeCustomPersonas([persona]);
    assert.deepEqual(normalized.skillIds, ["s1", "s2"]);
  });

  it("omits the field when a persona carries nothing", () => {
    const [normalized] = normalizeCustomPersonas([
      { ...persona, skillIds: [] },
    ]);
    assert.equal(normalized.skillIds, undefined);
  });

  it("drops junk rather than storing it", () => {
    const [normalized] = normalizeCustomPersonas([
      { ...persona, skillIds: ["s1", 9, "s1"] },
    ]);
    assert.deepEqual(normalized.skillIds, ["s1"]);
  });
});
