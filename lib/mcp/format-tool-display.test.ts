/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatMcpToolInput,
  formatMcpToolOutput,
  resolveToolCallArguments,
} from "./format-tool-display";

describe("formatMcpToolOutput", () => {
  it("unwraps success/result and pretty-prints JSON inside MCP text content", () => {
    const payloads = formatMcpToolOutput({
      success: true,
      ui: { resourceUri: "ui://skip" },
      result: {
        content: [
          {
            type: "text",
            text: '{"items":[{"id":"1","name":"Ada"}],"hasMore":false}',
          },
        ],
      },
    });

    assert.equal(payloads.length, 1);
    assert.equal(payloads[0]?.language, "json");
    assert.equal(
      payloads[0]?.code,
      `{
  "items": [
    {
      "id": "1",
      "name": "Ada"
    }
  ],
  "hasMore": false
}`,
    );
  });

  it("inflates nested JSON strings inside a parsed payload", () => {
    const payloads = formatMcpToolOutput({
      content: [
        {
          type: "text",
          text: '{"record":"{\\"id\\":\\"42\\"}"}',
        },
      ],
    });

    assert.equal(payloads[0]?.language, "json");
    assert.equal(
      payloads[0]?.code,
      `{
  "record": {
    "id": "42"
  }
}`,
    );
  });

  it("pretty-prints XML text content", () => {
    const payloads = formatMcpToolOutput({
      content: [
        {
          type: "text",
          text: '<?xml version="1.0"?><root><name>Ada</name><id>1</id></root>',
        },
      ],
    });

    assert.equal(payloads[0]?.language, "xml");
    assert.equal(
      payloads[0]?.code,
      `<?xml version="1.0"?>
<root>
  <name>
    Ada
  </name>
  <id>
    1
  </id>
</root>`,
    );
  });

  it("leaves plain text alone", () => {
    const payloads = formatMcpToolOutput({
      content: [{ type: "text", text: "No matching records." }],
    });
    assert.deepEqual(payloads, [
      { id: "content-0", language: "text", code: "No matching records." },
    ]);
  });

  it("prefers structuredContent when present", () => {
    const payloads = formatMcpToolOutput({
      structuredContent: { ok: true, count: 2 },
      content: [{ type: "text", text: "ignored" }],
    });
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0]?.id, "structured");
    assert.equal(payloads[0]?.language, "json");
    assert.equal(
      payloads[0]?.code,
      `{
  "ok": true,
  "count": 2
}`,
    );
  });

  it("redacts long binary content fields", () => {
    const payloads = formatMcpToolOutput({
      content: [
        {
          type: "image",
          mimeType: "image/png",
          data: "a".repeat(80),
        },
      ],
    });
    assert.equal(payloads[0]?.language, "json");
    assert.match(payloads[0]?.code ?? "", /\[binary 80 chars\]/);
    assert.doesNotMatch(payloads[0]?.code ?? "", /aaaaaaaaaa/);
  });

  it("formats multiple content blocks separately", () => {
    const payloads = formatMcpToolOutput({
      content: [
        { type: "text", text: '{"ok":true}' },
        { type: "text", text: "done" },
      ],
    });
    assert.equal(payloads.length, 2);
    assert.equal(payloads[0]?.language, "json");
    assert.equal(payloads[1]?.language, "text");
    assert.equal(payloads[1]?.code, "done");
  });

  it("does not treat invalid JSON-looking text as JSON", () => {
    const payloads = formatMcpToolOutput("{not json");
    assert.deepEqual(payloads, [
      { id: "value", language: "text", code: "{not json" },
    ]);
  });

  it("pretty-prints a bare object result", () => {
    const payloads = formatMcpToolOutput({
      success: true,
      result: { accountId: "123", connected: true },
    });
    assert.equal(payloads[0]?.language, "json");
    assert.equal(
      payloads[0]?.code,
      `{
  "accountId": "123",
  "connected": true
}`,
    );
  });
});

describe("formatMcpToolInput", () => {
  it("pretty-prints SuiteQL argument strings and indents them inside JSON", () => {
    const sql =
      "SELECT SUM(amount) as total_revenue, COUNT(id) as transaction_count FROM transaction WHERE type = 'SalesOrd' AND posting = 'T'";
    const payload = formatMcpToolInput({ sqlQuery: sql });
    assert.equal(payload.language, "json");
    assert.equal(
      payload.code,
      `{
  "sqlQuery": "SELECT
      SUM(amount) as total_revenue,
      COUNT(id) as transaction_count
    FROM transaction
    WHERE type = 'SalesOrd'
      AND posting = 'T'"
}`,
    );
  });
});

describe("resolveToolCallArguments", () => {
  it("prefers input, then args, then arguments", () => {
    assert.deepEqual(resolveToolCallArguments({ input: { sqlQuery: "a" } }), {
      sqlQuery: "a",
    });
    assert.deepEqual(resolveToolCallArguments({ args: { q: 1 } }), { q: 1 });
    assert.deepEqual(resolveToolCallArguments({ arguments: { q: 2 } }), {
      q: 2,
    });
    assert.equal(resolveToolCallArguments({}), undefined);
  });
});
