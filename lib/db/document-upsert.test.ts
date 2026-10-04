import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { documentUpdateSet } from "./document-upsert";

const NOW = new Date("2026-10-03T00:00:00.000Z");

describe("document update set", () => {
  it("writes the account when the write names one", () => {
    // Moving a memory to a NetSuite account saved its text and kept the old
    // account, because this column was never in the set.
    const set = documentUpdateSet(
      { content: "x", netsuiteAccountId: "td3096430" },
      NOW,
    );
    assert.equal(set.netsuiteAccountId, "td3096430");
  });

  it("writes no account when the write names none", () => {
    const set = documentUpdateSet(
      { content: "x", netsuiteAccountId: null },
      NOW,
    );
    assert.ok("netsuiteAccountId" in set);
    assert.equal(set.netsuiteAccountId, null);
  });

  it("leaves the account alone when the write is silent about it", () => {
    // An artifact write names no account, and must not clear one.
    const set = documentUpdateSet({ content: "x" }, NOW);
    assert.ok(!("netsuiteAccountId" in set));
  });

  it("counts the write and stamps the time", () => {
    const set = documentUpdateSet({ content: "x" }, NOW);
    assert.equal(set.updatedAt, NOW);
    assert.ok(set.version);
  });
});
