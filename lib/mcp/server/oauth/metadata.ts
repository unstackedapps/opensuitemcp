import {
  MCP_AUTHORIZE_PATH,
  MCP_REGISTRATION_PATH,
  MCP_REVOCATION_PATH,
  MCP_SCOPE,
  MCP_TOKEN_PATH,
  OFFLINE_ACCESS_SCOPE,
} from "../config";
import { SUPPORTED_AUTH_METHODS } from "./client-metadata";
import { CODE_CHALLENGE_METHOD } from "./pkce-verify";

/**
 * The two discovery documents, built from one origin.
 *
 * Pure on purpose. A client validates that the `issuer` in the document equals
 * the URL it fetched the document from, and rejects the metadata outright when
 * they differ — so the single most likely way to break OAuth on a self-hosted
 * install is an origin derived from the wrong header. Keeping the construction
 * here, away from the route, is what makes that testable.
 */

export type AuthorizationServerMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  revocation_endpoint: string;
  scopes_supported: string[];
  response_types_supported: string[];
  response_modes_supported: string[];
  grant_types_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  revocation_endpoint_auth_methods_supported: string[];
  code_challenge_methods_supported: string[];
  client_id_metadata_document_supported: boolean;
  authorization_response_iss_parameter_supported: boolean;
  service_documentation: string;
};

export type ProtectedResourceMetadata = {
  resource: string;
  resource_name: string;
  resource_documentation: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
  mcp_endpoint: string;
};

export function buildAuthorizationServerMetadata(
  origin: string,
): AuthorizationServerMetadata {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}${MCP_AUTHORIZE_PATH}`,
    token_endpoint: `${origin}${MCP_TOKEN_PATH}`,
    registration_endpoint: `${origin}${MCP_REGISTRATION_PATH}`,
    revocation_endpoint: `${origin}${MCP_REVOCATION_PATH}`,
    // offline_access belongs here and not in the resource metadata: a client
    // appends it to obtain a refresh token, which is a client concern rather
    // than something the resource requires.
    scopes_supported: [MCP_SCOPE, OFFLINE_ACCESS_SCOPE],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: [...SUPPORTED_AUTH_METHODS],
    revocation_endpoint_auth_methods_supported: [...SUPPORTED_AUTH_METHODS],
    // OAuth 2.1 removed `plain`, and a client checks this before it starts.
    code_challenge_methods_supported: [CODE_CHALLENGE_METHOD],
    // Claude selects a Client ID Metadata Document only when this is true *and*
    // "none" appears above, because its CIMD client authenticates as a public
    // client. Drop either and it silently falls back to registering a new
    // client on every connection.
    client_id_metadata_document_supported: true,
    // RFC 9207. A client that records the issuer can then detect a mix-up
    // attack before it sends the authorization code anywhere.
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${origin}/docs/connect-an-agent`,
  };
}

export function buildProtectedResourceMetadata(params: {
  origin: string;
  resource: string;
  mcpEndpoint: string;
}): ProtectedResourceMetadata {
  return {
    resource: params.resource,
    resource_name: "OpenSuiteMCP",
    resource_documentation: `${params.origin}/docs/mcp-server`,
    // The field that makes sign-in possible at all. A client reads it after a
    // 401 and goes looking for the authorization server; without it there is
    // nothing to discover and every client falls back to "paste a token".
    authorization_servers: [params.origin],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
    mcp_endpoint: params.mcpEndpoint,
  };
}
