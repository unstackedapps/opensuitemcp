import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type ChatWithActivity, chatStatus } from "./chat-status";

const BASE = {
  updatedAt: new Date("2026-09-28T12:00:00Z"),
  lastViewedAt: null,
  maxIterationsReached: false,
  isLive: false,
  lastOutcome: null,
} as unknown as ChatWithActivity;

function chat(overrides: Partial<ChatWithActivity>): ChatWithActivity {
  return { ...BASE, ...overrides } as ChatWithActivity;
}

describe("chatStatus", () => {
  it("a live stream outranks everything else", () => {
    assert.equal(
      chatStatus(chat({ isLive: true, maxIterationsReached: true })),
      "working",
    );
  });

  it("viewed after the last change is idle", () => {
    assert.equal(
      chatStatus(chat({ lastViewedAt: new Date("2026-09-28T12:00:01Z") })),
      "idle",
    );
  });

  it("a viewed chat that hit the iteration cap stays idle", () => {
    assert.equal(
      chatStatus(
        chat({
          maxIterationsReached: true,
          lastViewedAt: new Date("2026-09-28T12:00:01Z"),
        }),
      ),
      "idle",
    );
  });

  it("the iteration cap needs the user", () => {
    assert.equal(chatStatus(chat({ maxIterationsReached: true })), "needsUser");
  });

  it("a failed run needs the user", () => {
    assert.equal(chatStatus(chat({ lastOutcome: "error" })), "needsUser");
  });

  it("never opened counts as unviewed", () => {
    assert.equal(chatStatus(chat({ lastViewedAt: null })), "finished");
  });

  it("changed since the last view is finished", () => {
    assert.equal(
      chatStatus(chat({ lastViewedAt: new Date("2026-09-28T11:59:59Z") })),
      "finished",
    );
  });

  it("a completed run the user has not seen is finished, not needsUser", () => {
    assert.equal(chatStatus(chat({ lastOutcome: "completed" })), "finished");
  });

  // The sidebar is fed by Response.json, so every timestamp arrives as a
  // string. Calling .getTime() on one threw on every row and took the app down.
  it("reads timestamps that arrived over the wire as ISO strings", () => {
    const wire = JSON.parse(
      JSON.stringify(
        chat({
          updatedAt: new Date("2026-09-28T12:00:00Z"),
          lastViewedAt: new Date("2026-09-28T11:59:59Z"),
        }),
      ),
    ) as ChatWithActivity;

    assert.equal(typeof wire.updatedAt, "string");
    assert.equal(chatStatus(wire), "finished");
  });

  it("the chat on screen never reads finished, so no dot flashes at it", () => {
    const justFinished = chat({ lastViewedAt: null, lastOutcome: "completed" });
    assert.equal(chatStatus(justFinished), "finished");
    assert.equal(chatStatus(justFinished, true), "idle");
  });

  it("the chat on screen still pulses while its turn runs", () => {
    assert.equal(chatStatus(chat({ isLive: true }), true), "working");
  });

  it("drops the cap dot for the chat on screen, which shows the banner", () => {
    assert.equal(chatStatus(chat({ maxIterationsReached: true })), "needsUser");
    assert.equal(
      chatStatus(chat({ maxIterationsReached: true }), true),
      "idle",
    );
  });

  it("treats a viewed chat as idle over the wire too", () => {
    const wire = JSON.parse(
      JSON.stringify(
        chat({
          updatedAt: new Date("2026-09-28T12:00:00Z"),
          lastViewedAt: new Date("2026-09-28T12:00:01Z"),
        }),
      ),
    ) as ChatWithActivity;

    assert.equal(chatStatus(wire), "idle");
  });
});
