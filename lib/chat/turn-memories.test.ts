import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatMessage } from "@/lib/types";
import {
  collectTurnMemories,
  getMemoriesForAssistantTurn,
} from "./turn-memories";

function assistant(parts: unknown[], id = "a1"): ChatMessage {
  return {
    id,
    role: "assistant",
    parts: parts as ChatMessage["parts"],
  };
}

function user(id: string): ChatMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text: "hi" }] as ChatMessage["parts"],
  };
}

describe("turn memories", () => {
  it("reads the memories recorded on the turn", () => {
    const memories = collectTurnMemories(
      assistant([
        { type: "text", text: "hello" },
        {
          type: "data-turnMemories",
          data: [
            { path: "reporting-style.md", accountId: null },
            { path: "subsidiary.md", accountId: "td3096430" },
          ],
        },
      ]),
    );
    assert.deepEqual(memories, [
      { path: "reporting-style.md", accountId: null },
      { path: "subsidiary.md", accountId: "td3096430" },
    ]);
  });

  it("keeps one row per path when the part arrives twice", () => {
    const memories = collectTurnMemories(
      assistant([
        {
          type: "data-turnMemories",
          data: [{ path: "a.md", accountId: "td1" }],
        },
        {
          type: "data-turnMemories",
          data: [{ path: "a.md", accountId: "td1" }],
        },
      ]),
    );
    assert.equal(memories.length, 1);
  });

  it("drops a row that names no path", () => {
    const memories = collectTurnMemories(
      assistant([
        {
          type: "data-turnMemories",
          data: [{ path: "", accountId: null }, { accountId: null }, null],
        },
      ]),
    );
    assert.deepEqual(memories, []);
  });

  it("finds nothing on a turn that read nothing", () => {
    assert.deepEqual(collectTurnMemories(assistant([])), []);
    assert.deepEqual(collectTurnMemories(undefined), []);
  });
});

describe("memories for an assistant turn", () => {
  it("reads a list that landed on an earlier message of the same turn", () => {
    // The data parts arrive before the answer starts, so they can end up in
    // their own assistant message, which is never rendered.
    const messages = [
      user("u1"),
      assistant(
        [
          {
            type: "data-turnMemories",
            data: [{ path: "a.md", accountId: "td1" }],
          },
        ],
        "a1",
      ),
      assistant([{ type: "text", text: "the answer" }], "a2"),
    ];
    assert.deepEqual(getMemoriesForAssistantTurn(messages, "a2"), [
      { path: "a.md", accountId: "td1" },
    ]);
  });

  it("stops at the previous turn", () => {
    const messages = [
      user("u1"),
      assistant(
        [
          {
            type: "data-turnMemories",
            data: [{ path: "old.md", accountId: null }],
          },
          { type: "text", text: "first answer" },
        ],
        "a1",
      ),
      user("u2"),
      assistant([{ type: "text", text: "second answer" }], "a2"),
    ];
    assert.deepEqual(getMemoriesForAssistantTurn(messages, "a2"), []);
  });

  it("finds nothing for a message that is not there", () => {
    assert.deepEqual(getMemoriesForAssistantTurn([], "missing"), []);
  });
});
