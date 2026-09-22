import { getPublicAppOrigin } from "@/lib/http/public-origin";

/** Single Streamable HTTP endpoint every external agent connects to. */
export const MCP_SERVER_PATH = "/api/mcp";

/**
 * RFC 9728 protected resource metadata. Served from the app root so clients
 * that probe the origin before the resource path still find it.
 */
export const MCP_PROTECTED_RESOURCE_PATH =
  "/.well-known/oauth-protected-resource";

export const MCP_SERVER_NAME = "opensuitemcp";

/**
 * The URL an external agent is configured with. Derived from the install's
 * public origin rather than stored, so self-hosted, sandbox, and cloud
 * installs each advertise their own address with no extra configuration.
 */
export function getMcpServerUrl(request?: Request): string {
  return `${getPublicAppOrigin(request)}${MCP_SERVER_PATH}`;
}

/**
 * Canonical resource identifier for this MCP server (RFC 8707). Clients that
 * request a token scope it to this value.
 */
export function getMcpResourceIdentifier(request?: Request): string {
  return getMcpServerUrl(request);
}

export function getMcpProtectedResourceUrl(request?: Request): string {
  return `${getPublicAppOrigin(request)}${MCP_PROTECTED_RESOURCE_PATH}`;
}

/** Per-minute call budget for one API key. 0 or unset disables the limit. */
export function getMcpCallBurstLimit(): number {
  const raw = process.env.MCP_CALL_LIMIT_PER_MINUTE?.trim();
  if (!raw) {
    return 0;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
