/**
 * MCP wire protocol constants and framing.
 *
 * Every detail of the transport specification lives in this file so a future
 * spec revision — or a swap to an upstream adapter — is a contained change.
 *
 * Revision `2026-07-28` removed protocol sessions, the standalone GET stream,
 * and the `initialize` handshake, and made three request headers mandatory.
 * Earlier revisions are still accepted because most deployed clients predate
 * that change; see `isHandshakeEraVersion`.
 *
 * @see https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
 */

export const MCP_LATEST_PROTOCOL_VERSION = "2026-07-28";

/**
 * Newest first. Advertised by `server/discover` and used to answer an
 * unsupported-version error.
 */
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [
  "2026-07-28",
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
] as const;

export type McpProtocolVersion =
  (typeof MCP_SUPPORTED_PROTOCOL_VERSIONS)[number];

/** Revisions that still use `initialize` and may send a session header. */
export function isHandshakeEraVersion(version: string): boolean {
  return version !== MCP_LATEST_PROTOCOL_VERSION;
}

export function isSupportedProtocolVersion(
  version: string,
): version is McpProtocolVersion {
  return (MCP_SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(
    version,
  );
}

export const MCP_PROTOCOL_VERSION_HEADER = "mcp-protocol-version";
export const MCP_METHOD_HEADER = "mcp-method";
export const MCP_NAME_HEADER = "mcp-name";

/** `_meta` key carrying the protocol version inside the request body. */
export const MCP_META_PROTOCOL_VERSION_KEY =
  "io.modelcontextprotocol/protocolVersion";

/** JSON-RPC error codes, including the MCP-reserved sub-range. */
export const JSON_RPC_PARSE_ERROR = -32_700;
export const JSON_RPC_INVALID_REQUEST = -32_600;
export const JSON_RPC_METHOD_NOT_FOUND = -32_601;
export const JSON_RPC_INVALID_PARAMS = -32_602;
export const JSON_RPC_INTERNAL_ERROR = -32_603;
export const MCP_HEADER_MISMATCH = -32_020;
export const MCP_UNSUPPORTED_PROTOCOL_VERSION = -32_022;

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcErrorBody = {
  code: number;
  message: string;
  data?: unknown;
};

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: JsonRpcErrorBody };

export function jsonRpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

/** Shape check only — authorization happens before a body is ever parsed. */
export function parseJsonRpcRequest(body: unknown): JsonRpcRequest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const candidate = body as Record<string, unknown>;
  if (candidate.jsonrpc !== "2.0" || typeof candidate.method !== "string") {
    return null;
  }
  const id = candidate.id;
  if (
    id !== undefined &&
    id !== null &&
    typeof id !== "string" &&
    typeof id !== "number"
  ) {
    return null;
  }
  const params = candidate.params;
  if (
    params !== undefined &&
    (typeof params !== "object" || params === null || Array.isArray(params))
  ) {
    return null;
  }

  return {
    jsonrpc: "2.0",
    id: (id ?? null) as JsonRpcId,
    method: candidate.method,
    params: (params ?? {}) as Record<string, unknown>,
  };
}

/** The value `Mcp-Name` must carry for a given method, or null if none. */
export function expectedMcpNameFor(request: JsonRpcRequest): string | null {
  const params = request.params ?? {};
  if (request.method === "tools/call" || request.method === "prompts/get") {
    return typeof params.name === "string" ? params.name : null;
  }
  if (request.method === "resources/read") {
    return typeof params.uri === "string" ? params.uri : null;
  }
  return null;
}

const BASE64_SENTINEL_PREFIX = "=?base64?";
const BASE64_SENTINEL_SUFFIX = "?=";

/**
 * Decode the sentinel encoding the spec defines for header values that cannot
 * be represented as plain ASCII.
 */
export function decodeMcpHeaderValue(value: string): string {
  if (
    value.startsWith(BASE64_SENTINEL_PREFIX) &&
    value.endsWith(BASE64_SENTINEL_SUFFIX) &&
    value.length > BASE64_SENTINEL_PREFIX.length + BASE64_SENTINEL_SUFFIX.length
  ) {
    const encoded = value.slice(
      BASE64_SENTINEL_PREFIX.length,
      value.length - BASE64_SENTINEL_SUFFIX.length,
    );
    try {
      return Buffer.from(encoded, "base64").toString("utf8");
    } catch {
      return value;
    }
  }
  return value;
}

export type HeaderValidationResult =
  | { ok: true; protocolVersion: McpProtocolVersion }
  | { ok: false; code: number; message: string; data?: unknown };

/**
 * Validate the mandatory request-metadata headers against the body.
 *
 * Header/body agreement is a security requirement, not a formality: an
 * intermediary may route or rate-limit on the header while this server acts on
 * the body, so a mismatch is rejected rather than reconciled.
 */
export function validateMcpHeaders(
  headers: Headers,
  request: JsonRpcRequest,
): HeaderValidationResult {
  const rawVersion = headers.get(MCP_PROTOCOL_VERSION_HEADER)?.trim();

  // Pre-2025-06-18 clients did not define the header; treat as the oldest
  // revision this server accepts rather than rejecting outright.
  const protocolVersion = rawVersion || "2025-03-26";

  if (!isSupportedProtocolVersion(protocolVersion)) {
    return {
      ok: false,
      code: MCP_UNSUPPORTED_PROTOCOL_VERSION,
      message: `Unsupported protocol version: ${protocolVersion}`,
      data: { supported: [...MCP_SUPPORTED_PROTOCOL_VERSIONS] },
    };
  }

  const metaVersion = readMetaProtocolVersion(request);
  if (metaVersion && rawVersion && metaVersion !== rawVersion) {
    return {
      ok: false,
      code: MCP_HEADER_MISMATCH,
      message: `Header mismatch: MCP-Protocol-Version header value '${rawVersion}' does not match body value '${metaVersion}'`,
    };
  }

  // The remaining headers became mandatory in 2026-07-28. Enforcing them on
  // handshake-era clients would reject every client in the field today.
  if (isHandshakeEraVersion(protocolVersion)) {
    return { ok: true, protocolVersion };
  }

  const methodHeader = headers.get(MCP_METHOD_HEADER)?.trim();
  if (!methodHeader) {
    return {
      ok: false,
      code: MCP_HEADER_MISMATCH,
      message: "Header mismatch: required header Mcp-Method is missing",
    };
  }
  if (methodHeader !== request.method) {
    return {
      ok: false,
      code: MCP_HEADER_MISMATCH,
      message: `Header mismatch: Mcp-Method header value '${methodHeader}' does not match body value '${request.method}'`,
    };
  }

  const expectedName = expectedMcpNameFor(request);
  if (expectedName !== null) {
    const nameHeader = headers.get(MCP_NAME_HEADER)?.trim();
    if (!nameHeader) {
      return {
        ok: false,
        code: MCP_HEADER_MISMATCH,
        message: "Header mismatch: required header Mcp-Name is missing",
      };
    }
    if (decodeMcpHeaderValue(nameHeader) !== expectedName) {
      return {
        ok: false,
        code: MCP_HEADER_MISMATCH,
        message: `Header mismatch: Mcp-Name header value does not match body value '${expectedName}'`,
      };
    }
  }

  return { ok: true, protocolVersion };
}

function readMetaProtocolVersion(request: JsonRpcRequest): string | null {
  const meta = request.params?._meta;
  if (!meta || typeof meta !== "object") {
    return null;
  }
  const value = (meta as Record<string, unknown>)[
    MCP_META_PROTOCOL_VERSION_KEY
  ];
  return typeof value === "string" ? value : null;
}
