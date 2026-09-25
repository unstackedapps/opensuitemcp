import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMessageParts } from "./chat-parts";

const ids = () => {
  let n = 0;
  return () => `id-${++n}`;
};
const build = (params: { role?: string; text?: string; parts?: unknown }) =>
  buildMessageParts({
    role: params.role ?? "assistant",
    text: params.text ?? "",
    parts: params.parts,
    newId: ids(),
  });

describe("buildMessageParts", () => {
  it("keeps plain text working unchanged", () => {
    const built = build({ text: "done" });
    assert.deepEqual(built, {
      ok: true,
      parts: [{ type: "text", text: "done" }],
    });
  });

  it("records a tool call as dynamic-tool, not as one of this app's tools", () => {
    const built = build({
      parts: [
        { kind: "reasoning", text: "The statement is the source of truth." },
        {
          kind: "tool",
          name: "ns_getVendorBill",
          input: { id: 42 },
          output: { total: 100 },
        },
        { kind: "text", text: "Reconciled." },
      ],
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.deepEqual(built.parts[0], {
      type: "reasoning",
      text: "The statement is the source of truth.",
    });
    // A recorded ns_ call must NOT become type "tool-ns_..." — that branch
    // renders as though this app had made the call itself.
    assert.deepEqual(built.parts[1], {
      type: "dynamic-tool",
      toolName: "ns_getVendorBill",
      toolCallId: "id-1",
      input: { id: 42 },
      state: "output-available",
      output: { total: 100 },
    });
    assert.deepEqual(built.parts[2], { type: "text", text: "Reconciled." });
  });

  it("carries a failed call as an error, not an output", () => {
    const built = build({
      parts: [{ kind: "tool", name: "search", error: "timed out" }],
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.parts[0].state, "output-error");
    assert.equal(built.parts[0].errorText, "timed out");
    assert.equal("output" in built.parts[0], false);
  });

  it("marks a call still in flight", () => {
    const built = build({
      parts: [{ kind: "tool", name: "search", input: { q: "x" } }],
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.parts[0].state, "input-available");
  });

  it("refuses text and parts together", () => {
    const built = build({ text: "hi", parts: [{ kind: "text", text: "hi" }] });
    assert.equal(built.ok, false);
    assert.match(String(!built.ok && built.error), /not both/);
  });

  it("keeps tool calls and reasoning off a user message", () => {
    assert.match(
      String(
        build({ role: "user", parts: [{ kind: "tool", name: "x" }] }).error,
      ),
      /Only an `assistant` message carries a tool call/,
    );
    assert.match(
      String(
        build({ role: "user", parts: [{ kind: "reasoning", text: "x" }] })
          .error,
      ),
      /Only an `assistant` message carries reasoning/,
    );
  });

  it("names a malformed entry by its position", () => {
    assert.match(
      String(
        build({ parts: [{ kind: "text", text: "ok" }, { kind: "tool" }] })
          .error,
      ),
      /parts\[1\] is a tool part and needs `name`/,
    );
    assert.match(
      String(build({ parts: [{ kind: "spell" }] }).error),
      /parts\[0\] has an unknown `kind`/,
    );
  });

  it("holds the whole message to the text budget, not each part", () => {
    const half = "x".repeat(20_000);
    assert.equal(
      build({
        parts: [
          { kind: "text", text: half },
          { kind: "text", text: half },
        ],
      }).ok,
      false,
    );
  });

  it("refuses an oversized tool payload rather than storing it", () => {
    assert.match(
      String(
        build({
          parts: [
            {
              kind: "tool",
              name: "dump",
              output: { rows: "y".repeat(20_000) },
            },
          ],
        }).error,
      ),
      /the limit is 16000/,
    );
  });
});
