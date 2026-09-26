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

/**
 * OAuth 2.1 authorization server paths.
 *
 * Every install is its own authorization server, at its own origin. That is
 * partly principle — a self-hosted install must not depend on a service it does
 * not run — and partly pragmatism: Claude's connector probes
 * `/.well-known/oauth-authorization-server` on the MCP server's own origin and
 * has been observed ignoring `authorization_servers` entirely. Co-locating the
 * two means the flow works either way.
 */
export const MCP_AUTHORIZATION_SERVER_PATH =
  "/.well-known/oauth-authorization-server";
export const MCP_OPENID_CONFIGURATION_PATH =
  "/.well-known/openid-configuration";
export const MCP_AUTHORIZE_PATH = "/oauth/authorize";
export const MCP_TOKEN_PATH = "/api/oauth/token";
export const MCP_REGISTRATION_PATH = "/api/oauth/register";
export const MCP_REVOCATION_PATH = "/api/oauth/revoke";

/**
 * The one scope this server issues.
 *
 * Migration 0026 dropped per-key scopes deliberately: what an agent reaches is
 * decided by the app's own tool policy, re-read on every call, and a second
 * gate that could disagree with it was worse than no gate. OAuth needs a scope
 * string, so there is exactly one, and it means "act as me over MCP".
 */
export const MCP_SCOPE = "mcp";

/**
 * Requested alongside `mcp` by clients that want a refresh token.
 *
 * Advertised in authorization server metadata but deliberately left out of the
 * protected resource metadata: RFC 9728 describes what the *resource* requires,
 * and a refresh token is a client concern.
 */
export const OFFLINE_ACCESS_SCOPE = "offline_access";

/** The issuer identifier clients validate discovery documents against. */
export function getMcpIssuer(request?: Request): string {
  return getPublicAppOrigin(request);
}

export function getMcpAuthorizationServerUrl(request?: Request): string {
  return `${getPublicAppOrigin(request)}${MCP_AUTHORIZATION_SERVER_PATH}`;
}
