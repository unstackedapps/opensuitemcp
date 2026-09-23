import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeMcpHeaderValue,
  expectedMcpNameFor,
  isHandshakeEraVersion,
  type JsonRpcRequest,
  jsonRpcError,
  MCP_HEADER_MISMATCH,
  MCP_LATEST_PROTOCOL_VERSION,
  MCP_UNSUPPORTED_PROTOCOL_VERSION,
  negotiateInitializeVersion,
  parseJsonRpcRequest,
  validateMcpHeaders,
} from "./protocol";

function request(
  method: string,
  params?: Record<string, unknown>,
): JsonRpcRequest {
  return { jsonrpc: "2.0", id: 1, method, params: params ?? {} };
}

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

describe("parseJsonRpcRequest", () => {
  it("accepts a well-formed request and defaults params and id", () => {
    const parsed = parseJsonRpcRequest({
      jsonrpc: "2.0",
      method: "tools/list",
    });
    assert.deepEqual(parsed, {
      jsonrpc: "2.0",
      id: null,
      method: "tools/list",
      params: {},
    });
  });

  it("rejects malformed bodies", () => {
    const cases: unknown[] = [
      null,
      "string",
      [],
      {},
      { jsonrpc: "1.0", method: "tools/list" },
      { jsonrpc: "2.0" },
      { jsonrpc: "2.0", method: 5 },
      { jsonrpc: "2.0", method: "x", id: {} },
      { jsonrpc: "2.0", method: "x", params: [] },
      { jsonrpc: "2.0", method: "x", params: "nope" },
    ];
    for (const value of cases) {
      assert.equal(parseJsonRpcRequest(value), null, JSON.stringify(value));
    }
  });
});

describe("expectedMcpNameFor", () => {
  it("reads the name or uri the spec mirrors into Mcp-Name", () => {
    assert.equal(
      expectedMcpNameFor(request("tools/call", { name: "ns_getRecord" })),
      "ns_getRecord",
    );
    assert.equal(
      expectedMcpNameFor(request("resources/read", { uri: "ui://x" })),
      "ui://x",
    );
    assert.equal(expectedMcpNameFor(request("tools/list")), null);
  });
});

describe("decodeMcpHeaderValue", () => {
  it("decodes the base64 sentinel and passes plain values through", () => {
    const encoded = Buffer.from("Hello, 世界", "utf8").toString("base64");
    assert.equal(decodeMcpHeaderValue(`=?base64?${encoded}?=`), "Hello, 世界");
    assert.equal(decodeMcpHeaderValue("us-west1"), "us-west1");
    assert.equal(decodeMcpHeaderValue("=?base64??="), "=?base64??=");
  });
});

describe("validateMcpHeaders on the current revision", () => {
  const version = MCP_LATEST_PROTOCOL_VERSION;

  it("accepts a fully conforming tools/call", () => {
    const result = validateMcpHeaders(
      headers({
        "mcp-protocol-version": version,
        "mcp-method": "tools/call",
        "mcp-name": "ns_getRecord",
      }),
      request("tools/call", { name: "ns_getRecord" }),
    );
    assert.deepEqual(result, { ok: true, protocolVersion: version });
  });

  it("rejects a missing Mcp-Method", () => {
    const result = validateMcpHeaders(
      headers({ "mcp-protocol-version": version }),
      request("tools/list"),
    );
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.code, MCP_HEADER_MISMATCH);
  });

  it("rejects a Mcp-Method that disagrees with the body", () => {
    const result = validateMcpHeaders(
      headers({ "mcp-protocol-version": version, "mcp-method": "tools/list" }),
      request("tools/call", { name: "a" }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.code, MCP_HEADER_MISMATCH);
  });

  it("rejects a missing or mismatched Mcp-Name on tools/call", () => {
    const missing = validateMcpHeaders(
      headers({ "mcp-protocol-version": version, "mcp-method": "tools/call" }),
      request("tools/call", { name: "ns_getRecord" }),
    );
    assert.equal(missing.ok, false);

    const wrong = validateMcpHeaders(
      headers({
        "mcp-protocol-version": version,
        "mcp-method": "tools/call",
        "mcp-name": "ns_other",
      }),
      request("tools/call", { name: "ns_getRecord" }),
    );
    assert.equal(wrong.ok, false);
    assert.equal(wrong.ok === false && wrong.code, MCP_HEADER_MISMATCH);
  });

  it("accepts a base64-encoded Mcp-Name", () => {
    const name = "ns_报表";
    const encoded = Buffer.from(name, "utf8").toString("base64");
    const result = validateMcpHeaders(
      headers({
        "mcp-protocol-version": version,
        "mcp-method": "tools/call",
        "mcp-name": `=?base64?${encoded}?=`,
      }),
      request("tools/call", { name }),
    );
    assert.equal(result.ok, true);
  });

  it("rejects a header/body protocol version disagreement", () => {
    const result = validateMcpHeaders(
      headers({ "mcp-protocol-version": version, "mcp-method": "tools/list" }),
      request("tools/list", {
        _meta: { "io.modelcontextprotocol/protocolVersion": "2025-11-25" },
      }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.code, MCP_HEADER_MISMATCH);
  });
});

describe("validateMcpHeaders on handshake-era revisions", () => {
  it("does not require Mcp-Method or Mcp-Name", () => {
    const result = validateMcpHeaders(
      headers({ "mcp-protocol-version": "2025-06-18" }),
      request("tools/call", { name: "ns_getRecord" }),
    );
    assert.deepEqual(result, { ok: true, protocolVersion: "2025-06-18" });
  });

  it("defaults a missing version header to the oldest accepted revision", () => {
    const result = validateMcpHeaders(headers({}), request("initialize"));
    assert.deepEqual(result, { ok: true, protocolVersion: "2025-03-26" });
  });

  it("classifies revisions by era", () => {
    assert.equal(isHandshakeEraVersion("2026-07-28"), false);
    assert.equal(isHandshakeEraVersion("2025-11-25"), true);
  });
});

describe("validateMcpHeaders version support", () => {
  it("rejects an unknown protocol version with the supported list", () => {
    const result = validateMcpHeaders(
      headers({ "mcp-protocol-version": "2099-01-01" }),
      request("tools/list"),
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.code, MCP_UNSUPPORTED_PROTOCOL_VERSION);
      assert.ok(
        (result.data as { supported: string[] }).supported.includes(
          MCP_LATEST_PROTOCOL_VERSION,
        ),
      );
    }
  });
});

describe("jsonRpcError data", () => {
  it("carries a data payload when one is given", () => {
    const response = jsonRpcError(1, -32_601, "Method not found: listTools", {
      supported: ["tools/list"],
    });
    assert.deepEqual(response.error?.data, { supported: ["tools/list"] });
  });

  it("omits data entirely when none is given", () => {
    const response = jsonRpcError(1, -32_601, "Method not found: listTools");
    assert.ok(response.error);
    assert.equal("data" in response.error, false);
  });
});

describe("negotiateInitializeVersion", () => {
  it("answers with the revision the body asked for", () => {
    for (const asked of ["2025-11-25", "2025-06-18", "2025-03-26"]) {
      assert.equal(
        negotiateInitializeVersion(
          request("initialize", { protocolVersion: asked }),
          "2025-03-26",
        ),
        asked,
      );
    }
  });

  it("keeps the header answer when the body names no revision", () => {
    assert.equal(
      negotiateInitializeVersion(request("initialize"), "2025-06-18"),
      "2025-06-18",
    );
  });

  it("keeps the header answer when the body names an unsupported revision", () => {
    assert.equal(
      negotiateInitializeVersion(
        request("initialize", { protocolVersion: "2099-01-01" }),
        "2025-03-26",
      ),
      "2025-03-26",
    );
  });

  it("passes the stateless revision through for the caller to map", () => {
    assert.equal(
      negotiateInitializeVersion(
        request("initialize", {
          protocolVersion: MCP_LATEST_PROTOCOL_VERSION,
        }),
        "2025-03-26",
      ),
      MCP_LATEST_PROTOCOL_VERSION,
    );
  });
});
