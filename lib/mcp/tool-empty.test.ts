/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMcpToolEmptyResult } from "./tool-empty";

describe("isMcpToolEmptyResult", () => {
  it("treats blank, empty objects, and empty arrays as empty", () => {
    assert.equal(isMcpToolEmptyResult(undefined), true);
    assert.equal(isMcpToolEmptyResult(null), true);
    assert.equal(isMcpToolEmptyResult(""), true);
    assert.equal(isMcpToolEmptyResult("   "), true);
    assert.equal(isMcpToolEmptyResult([]), true);
    assert.equal(isMcpToolEmptyResult({}), true);
    assert.equal(isMcpToolEmptyResult("[]"), true);
    assert.equal(isMcpToolEmptyResult("{}"), true);
  });

  it("treats MCP CallToolResult empty content as empty", () => {
    assert.equal(isMcpToolEmptyResult({ content: [] }), true);
    assert.equal(
      isMcpToolEmptyResult({
        content: [{ type: "text", text: "" }],
        isError: false,
      }),
      true,
    );
    assert.equal(
      isMcpToolEmptyResult({
        content: [{ type: "text", text: "[]" }],
      }),
      true,
    );
    assert.equal(
      isMcpToolEmptyResult({
        content: [{ type: "text", text: "{}" }],
      }),
      true,
    );
    assert.equal(
      isMcpToolEmptyResult({
        structuredContent: [],
        content: [{ type: "text", text: "ignored when structured is empty" }],
      }),
      true,
    );
  });

  it("unwraps success/result wrappers used by NetSuite MCP tools", () => {
    assert.equal(
      isMcpToolEmptyResult({
        success: true,
        result: { content: [{ type: "text", text: "[]" }] },
      }),
      true,
    );
    assert.equal(
      isMcpToolEmptyResult({
        success: true,
        result: { content: [] },
      }),
      true,
    );
  });

  it("does not flag payloads that contain data or a message", () => {
    assert.equal(isMcpToolEmptyResult(0), false);
    assert.equal(isMcpToolEmptyResult(false), false);
    assert.equal(isMcpToolEmptyResult("No matching records."), false);
    assert.equal(isMcpToolEmptyResult({ items: [] }), false);
    assert.equal(
      isMcpToolEmptyResult({
        content: [{ type: "text", text: '{"items":[{"id":"1"}]}' }],
      }),
      false,
    );
    assert.equal(
      isMcpToolEmptyResult({
        success: true,
        result: {
          content: [{ type: "text", text: '{"items":[],"hasMore":false}' }],
        },
      }),
      false,
    );
    assert.equal(
      isMcpToolEmptyResult({
        content: [
          {
            type: "image",
            mimeType: "image/png",
            data: "abc",
          },
        ],
      }),
      false,
    );
  });
});
