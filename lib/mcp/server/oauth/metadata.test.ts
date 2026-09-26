import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
} from "./metadata";

const ORIGIN = "https://netsuite.acme.com";

describe("authorization server metadata", () => {
  const doc = buildAuthorizationServerMetadata(ORIGIN);

  it("issues from the install's own origin", () => {
    assert.equal(doc.issuer, ORIGIN);
    for (const endpoint of [
      doc.authorization_endpoint,
      doc.token_endpoint,
      doc.registration_endpoint,
      doc.revocation_endpoint,
    ]) {
      assert.ok(
        endpoint.startsWith(`${ORIGIN}/`),
        `${endpoint} should be same-origin`,
      );
    }
  });

  it("advertises both values Claude needs before it will use a CIMD", () => {
    assert.equal(doc.client_id_metadata_document_supported, true);
    assert.ok(doc.token_endpoint_auth_methods_supported.includes("none"));
  });

  it("advertises S256 and nothing else, since OAuth 2.1 removed plain", () => {
    assert.deepEqual(doc.code_challenge_methods_supported, ["S256"]);
  });

  it("lists offline_access so a client knows to ask for a refresh token", () => {
    assert.ok(doc.scopes_supported.includes("offline_access"));
    assert.ok(doc.grant_types_supported.includes("refresh_token"));
  });

  it("announces the iss parameter it will actually send", () => {
    assert.equal(doc.authorization_response_iss_parameter_supported, true);
  });

  it("offers only the authorization code flow", () => {
    assert.deepEqual(doc.response_types_supported, ["code"]);
    assert.ok(!doc.grant_types_supported.includes("client_credentials"));
  });
});

describe("protected resource metadata", () => {
  const doc = buildProtectedResourceMetadata({
    origin: ORIGIN,
    resource: `${ORIGIN}/api/mcp`,
    mcpEndpoint: `${ORIGIN}/api/mcp`,
  });

  it("points at this install as its own authorization server", () => {
    assert.deepEqual(doc.authorization_servers, [ORIGIN]);
  });

  it("names the endpoint exactly as a client enters it", () => {
    assert.equal(doc.resource, `${ORIGIN}/api/mcp`);
  });

  it("keeps offline_access out, since the resource does not require it", () => {
    assert.deepEqual(doc.scopes_supported, ["mcp"]);
  });
});
