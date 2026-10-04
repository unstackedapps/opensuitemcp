import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isMemoryStale,
  MEMORY_PROMPT_BUDGET,
  type MemoryEntry,
  renderMemoryPrompt,
  selectMemoriesForAccount,
} from "./memory";

const now = new Date("2026-10-01T12:00:00Z");

function entry(over: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    path: "preferences.md",
    content: "Figures in thousands.",
    netsuiteAccountId: null,
    updatedAt: new Date("2026-09-30T12:00:00Z"),
    ...over,
  };
}

describe("which memories a turn may see", () => {
  const workspace = entry({ path: "style.md", netsuiteAccountId: null });
  const sandbox = entry({ path: "sandbox.md", netsuiteAccountId: "TSTDRV1" });
  const production = entry({ path: "prod.md", netsuiteAccountId: "1234567" });
  const all = [workspace, sandbox, production];

  it("never shows one account's memory against another", () => {
    const seen = selectMemoriesForAccount(all, "1234567").map((e) => e.path);
    assert.deepEqual(seen, ["style.md", "prod.md"]);
  });

  it("shows workspace memories everywhere", () => {
    assert.deepEqual(
      selectMemoriesForAccount(all, "TSTDRV1").map((e) => e.path),
      ["style.md", "sandbox.md"],
    );
  });

  it("shows only workspace memories when no account is active", () => {
    assert.deepEqual(
      selectMemoriesForAccount(all, null).map((e) => e.path),
      ["style.md"],
    );
  });
});

describe("when a memory is old enough to doubt", () => {
  it("is fresh inside the window", () => {
    assert.equal(isMemoryStale(new Date("2026-09-01T12:00:00Z"), now), false);
  });

  it("is stale past it", () => {
    assert.equal(isMemoryStale(new Date("2025-09-01T12:00:00Z"), now), true);
  });
});

describe("the memory section of a prompt", () => {
  it("is nothing at all when there is nothing to say", () => {
    assert.equal(renderMemoryPrompt([], now), "");
  });

  it("carries the content and the date it was learned", () => {
    const rendered = renderMemoryPrompt([entry()], now);
    assert.match(rendered, /preferences\.md \(learned 2026-09-30\)/);
    assert.match(rendered, /Figures in thousands\./);
  });

  it("marks an old one rather than letting it pass as current", () => {
    const rendered = renderMemoryPrompt(
      [entry({ updatedAt: new Date("2024-01-01T12:00:00Z") })],
      now,
    );
    assert.match(rendered, /old enough to confirm before acting on/);
  });

  it("says these were told, not verified", () => {
    assert.match(
      renderMemoryPrompt([entry()], now),
      /not as something you verified/,
    );
  });

  it("sorts by path, so the same set renders the same way", () => {
    const rendered = renderMemoryPrompt(
      [entry({ path: "z.md" }), entry({ path: "a.md" })],
      now,
    );
    assert.ok(rendered.indexOf("a.md") < rendered.indexOf("z.md"));
  });

  it("sends the paths instead once the content stops fitting", () => {
    const many = Array.from({ length: 200 }, (_, index) =>
      entry({ path: `note-${index}.md`, content: "x".repeat(80) }),
    );
    const rendered = renderMemoryPrompt(many, now);
    assert.ok(rendered.length < MEMORY_PROMPT_BUDGET + 4000);
    assert.match(rendered, /read one with the recall tool/);
    assert.doesNotMatch(rendered, /xxxxxxxx/);
  });
});
