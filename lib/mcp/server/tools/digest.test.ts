import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toolSurfaceDigest } from "./digest";
import type { McpToolDefinition } from "./types";

function tool(
  name: string,
  overrides: Partial<McpToolDefinition> = {},
): McpToolDefinition {
  return {
    name,
    title: name,
    description: name,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async () => ({ content: [] }),
    ...overrides,
  };
}

describe("toolSurfaceDigest", () => {
  it("is stable for the same surface", () => {
    const surface = [tool("a"), tool("b")];
    assert.equal(toolSurfaceDigest(surface), toolSurfaceDigest([...surface]));
  });

  it("ignores the order tools arrive in", () => {
    assert.equal(
      toolSurfaceDigest([tool("a"), tool("b")]),
      toolSurfaceDigest([tool("b"), tool("a")]),
    );
  });

  it("changes when a tool is added", () => {
    assert.notEqual(
      toolSurfaceDigest([tool("a")]),
      toolSurfaceDigest([tool("a"), tool("b")]),
    );
  });

  it("changes when a tool is removed", () => {
    assert.notEqual(
      toolSurfaceDigest([tool("a"), tool("b")]),
      toolSurfaceDigest([tool("b")]),
    );
  });

  it("changes when a tool's arguments change", () => {
    assert.notEqual(
      toolSurfaceDigest([tool("a")]),
      toolSurfaceDigest([
        tool("a", {
          inputSchema: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
            additionalProperties: false,
          },
        }),
      ]),
    );
  });

  it("changes when a read tool starts advertising writes", () => {
    assert.notEqual(
      toolSurfaceDigest([tool("a")]),
      toolSurfaceDigest([tool("a", { annotations: { readOnlyHint: false } })]),
    );
  });

  it("does not change when only prose changes", () => {
    assert.equal(
      toolSurfaceDigest([tool("a")]),
      toolSurfaceDigest([tool("a", { description: "reworded" })]),
    );
  });
});
