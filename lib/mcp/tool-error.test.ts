/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMcpToolError } from "./tool-error";

describe("getMcpToolError", () => {
  it("detects a top-level error string", () => {
    assert.equal(
      getMcpToolError({
        error:
          "Error executing SuiteQL query: Search error occurred: Unknown identifier 'subsidiary'. Available identifiers are: {transaction=transaction}",
      }),
      "Error executing SuiteQL query: Search error occurred: Unknown identifier 'subsidiary'. Available identifiers are: {transaction=transaction}",
    );
  });

  it("detects success: false with error and message", () => {
    const error =
      'HTTP 500: {"type":"https://www.rfc-editor.org/rfc/rfc9110.html#section-15.6.1","title":"Internal Server Error","status":500}';
    assert.equal(
      getMcpToolError({
        success: false,
        error,
        message:
          "Failed to retrieve metadata for transaction endpoint: /services/rest/query/v1/suiteql/metadata-catalog/transaction",
      }),
      error,
    );
  });

  it("detects isError on a wrapped MCP CallToolResult", () => {
    assert.equal(
      getMcpToolError({
        success: true,
        result: {
          isError: true,
          content: [
            {
              type: "text",
              text: "Unknown identifier 'subsidiary'",
            },
          ],
        },
      }),
      "Unknown identifier 'subsidiary'",
    );
  });

  it("detects JSON error objects inside MCP text content", () => {
    assert.equal(
      getMcpToolError({
        success: true,
        result: {
          content: [
            {
              type: "text",
              text: '{"error":"Error executing SuiteQL query: Search error occurred"}',
            },
          ],
        },
      }),
      "Error executing SuiteQL query: Search error occurred",
    );
  });

  it("detects success: false JSON inside MCP text content", () => {
    assert.equal(
      getMcpToolError({
        success: true,
        result: {
          content: [
            {
              type: "text",
              text: '{"success":false,"error":"HTTP 500: boom","message":"Failed to retrieve metadata"}',
            },
          ],
        },
      }),
      "HTTP 500: boom",
    );
  });

  it("does not flag successful SuiteQL payloads", () => {
    assert.equal(
      getMcpToolError({
        success: true,
        result: {
          content: [
            {
              type: "text",
              text: '{"items":[{"id":"1"}],"hasMore":false}',
            },
          ],
        },
      }),
      undefined,
    );
  });

  it("does not flag objects that only have an errorCount", () => {
    assert.equal(getMcpToolError({ items: [], errorCount: 0 }), undefined);
  });

  it("does not treat a success message field as an error", () => {
    assert.equal(
      getMcpToolError({ success: true, message: "ok", items: [] }),
      undefined,
    );
  });
});
