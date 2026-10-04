import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeEditedAt } from "./edited-at";

const now = new Date("2026-10-01T12:00:00Z");

function ago(ms: number): Date {
  return new Date(now.getTime() - ms);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("when a document was last written", () => {
  it("says just now for the first minute", () => {
    assert.equal(describeEditedAt(ago(0), now), "Edited just now");
    assert.equal(describeEditedAt(ago(59_000), now), "Edited just now");
  });

  it("counts minutes, then hours", () => {
    assert.equal(describeEditedAt(ago(MINUTE), now), "Edited 1m ago");
    assert.equal(describeEditedAt(ago(59 * MINUTE), now), "Edited 59m ago");
    assert.equal(describeEditedAt(ago(HOUR), now), "Edited 1h ago");
    assert.equal(describeEditedAt(ago(14 * HOUR), now), "Edited 14h ago");
  });

  it("counts days up to a week", () => {
    assert.equal(describeEditedAt(ago(DAY), now), "Edited 1d ago");
    assert.equal(describeEditedAt(ago(2 * DAY), now), "Edited 2d ago");
    assert.equal(describeEditedAt(ago(6 * DAY), now), "Edited 6d ago");
  });

  it("gives the date once the gap stops meaning anything", () => {
    assert.equal(describeEditedAt(ago(7 * DAY), now), "Edited Sep 24");
    assert.equal(describeEditedAt(ago(60 * DAY), now), "Edited Aug 2");
  });

  it("names the year only when it is not this one", () => {
    assert.equal(
      describeEditedAt(new Date("2025-09-25T12:00:00Z"), now),
      "Edited Sep 25, 2025",
    );
  });

  it("does not count backwards when a clock disagrees", () => {
    assert.equal(describeEditedAt(ago(-5 * MINUTE), now), "Edited just now");
  });
});
