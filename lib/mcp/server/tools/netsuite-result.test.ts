import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCallResult } from "./netsuite-result";

describe("normalizeCallResult", () => {
  it("promotes the JSON document NetSuite stringifies into its text part", () => {
    // Shape observed from ns_runCustomSuiteQL against a live account.
    const payload = {
      method: "custom_suiteql",
      resultCount: 2,
      data: [{ id: 611 }, { id: 672 }],
    };
    const result = normalizeCallResult({
      content: [{ type: "text", text: JSON.stringify(payload) }],
      isError: false,
    });

    assert.deepEqual(result.structuredContent, payload);
    assert.equal(result.isError, false);
    // The readable half is left exactly as NetSuite sent it.
    assert.equal(result.content[0].text, JSON.stringify(payload));
  });

  it("keeps structuredContent when NetSuite supplies its own", () => {
    const result = normalizeCallResult({
      content: [{ type: "text", text: '{"ignored":true}' }],
      structuredContent: { rows: [1, 2] },
    });
    assert.deepEqual(result.structuredContent, { rows: [1, 2] });
  });

  it("wraps a bare array so structuredContent stays an object", () => {
    const result = normalizeCallResult({
      content: [{ type: "text", text: '[{"id":1}]' }],
    });
    assert.deepEqual(result.structuredContent, { data: [{ id: 1 }] });
  });

  it("leaves prose text alone rather than inventing structure", () => {
    const result = normalizeCallResult({
      content: [{ type: "text", text: "No records matched." }],
      isError: false,
    });
    assert.equal(result.content[0].text, "No records matched.");
    // Falls back to the envelope; nothing parseable was sent.
    assert.ok(result.structuredContent);
  });

  it("marks NetSuite errors as errors", () => {
    const result = normalizeCallResult({
      content: [{ type: "text", text: "Permission violation." }],
      isError: true,
    });
    assert.equal(result.isError, true);
  });

  it("re-parses nested stringified fields", () => {
    const result = normalizeCallResult({
      content: [{ type: "text", text: '{"rows":"[{\\"id\\":7}]"}' }],
    });
    assert.deepEqual(result.structuredContent, { rows: [{ id: 7 }] });
  });

  it("flags a NetSuite permission refusal as an error", () => {
    // Payload captured from ns_createRecord on a role lacking Lists -> Customers.
    const result = normalizeCallResult({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: 'HTTP 403: {"o:errorCode":"INSUFFICIENT_PERMISSION"}',
            message: "Failed to create customer record",
          }),
        },
      ],
      isError: false,
    });

    assert.equal(result.isError, true);
  });

  it("leaves a successful write reported as success", () => {
    // Payload captured from a contact created through the MCP server.
    const result = normalizeCallResult({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            recordId: "1769",
            message: "Successfully created contact record",
          }),
        },
      ],
      isError: false,
    });

    assert.equal(result.isError, false);
  });

  it("flags a bare object carrying an error", () => {
    const result = normalizeCallResult({ error: "Something broke." });
    assert.equal(result.isError, true);
  });

  it("does not invent failure from a payload with no verdict", () => {
    const result = normalizeCallResult({
      content: [{ type: "text", text: '{"rows":[]}' }],
    });
    assert.equal(result.isError, false);
  });
});
