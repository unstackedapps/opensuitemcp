/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectToolParts, groupMessageParts } from "./group-message-parts";

describe("groupMessageParts", () => {
  it("absorbs sequential tools across step-start parts into one deck", () => {
    const groups = groupMessageParts([
      { type: "step-start" },
      { type: "tool-ns_getSuiteQLMetadata" },
      { type: "step-start" },
      { type: "tool-ns_runCustomSuiteQL" },
      { type: "step-start" },
      { type: "text", text: "Result: 84 active employees" },
      { type: "data-usage" },
    ]);

    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.kind, "tools");
    if (groups[0]?.kind === "tools") {
      assert.deepEqual(
        groups[0].items.map((item) => item.part.type),
        ["tool-ns_getSuiteQLMetadata", "tool-ns_runCustomSuiteQL"],
      );
    }
    assert.equal(groups[1]?.kind, "single");
    if (groups[1]?.kind === "single") {
      assert.equal(groups[1].part.type, "text");
    }
  });

  it("still splits tools when visible text sits between them", () => {
    const groups = groupMessageParts([
      { type: "tool-ns_getSuiteQLMetadata" },
      { type: "text", text: "checking schema…" },
      { type: "tool-ns_runCustomSuiteQL" },
    ]);

    assert.equal(groups.length, 3);
    assert.equal(groups[0]?.kind, "tools");
    assert.equal(groups[1]?.kind, "single");
    assert.equal(groups[2]?.kind, "tools");
  });

  it("collects tools from every deck in order", () => {
    const items = collectToolParts([
      { type: "tool-ns_getSuiteQLMetadata" },
      { type: "text", text: "checking schema…" },
      { type: "tool-ns_runCustomSuiteQL" },
    ]);
    assert.deepEqual(
      items.map((item) => item.part.type),
      ["tool-ns_getSuiteQLMetadata", "tool-ns_runCustomSuiteQL"],
    );
  });
});
