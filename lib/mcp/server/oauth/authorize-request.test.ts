import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAuthorizationRedirect,
  type RawAuthorizeParams,
  validateAuthorizeRequest,
} from "./authorize-request";
import type { ClientMetadata } from "./client-metadata";

const RESOURCE = "https://netsuite.acme.com/api/mcp";
const ISSUER = "https://netsuite.acme.com";
const CHALLENGE = "a".repeat(43);

const HOSTED: ClientMetadata = {
  clientName: "Claude",
  clientUri: "https://claude.ai",
  logoUri: null,
  redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
  grantTypes: ["authorization_code", "refresh_token"],
  responseTypes: ["code"],
  tokenEndpointAuthMethod: "none",
  scope: null,
  softwareId: null,
};

const NATIVE: ClientMetadata = {
  ...HOSTED,
  clientName: "Claude Code",
  redirectUris: ["http://localhost/callback", "http://127.0.0.1/callback"],
};

function validate(raw: RawAuthorizeParams, client: ClientMetadata = HOSTED) {
  return validateAuthorizeRequest({
    raw,
    clientId: "osmcp_client_abc",
    client,
    serverResource: RESOURCE,
    scope: "mcp",
  });
}

const GOOD: RawAuthorizeParams = {
  client_id: "osmcp_client_abc",
  redirect_uri: "https://claude.ai/api/mcp/auth_callback",
  response_type: "code",
  code_challenge: CHALLENGE,
  code_challenge_method: "S256",
  state: "xyz",
};

describe("authorization requests", () => {
  it("accepts a well-formed request", () => {
    const result = validate(GOOD);
    assert.equal(result.kind, "ok");
    assert.ok(result.kind === "ok");
    assert.equal(result.request.redirectUri, GOOD.redirect_uri);
    assert.equal(result.request.state, "xyz");
    assert.equal(result.request.resource, RESOURCE);
  });

  it("accepts a request with no resource parameter, as Claude sends", () => {
    const result = validate({ ...GOOD, resource: undefined });
    assert.ok(result.kind === "ok");
    assert.equal(result.request.resource, RESOURCE);
  });

  it("lets a single-redirect client omit redirect_uri", () => {
    const result = validate({ ...GOOD, redirect_uri: undefined });
    assert.ok(result.kind === "ok");
    assert.equal(result.request.redirectUri, HOSTED.redirectUris[0]);
  });

  it("sends a native client back to the port it is listening on", () => {
    const result = validate(
      { ...GOOD, redirect_uri: "http://127.0.0.1:52341/callback" },
      NATIVE,
    );
    assert.ok(result.kind === "ok");
    assert.equal(result.request.redirectUri, "http://127.0.0.1:52341/callback");
  });
});

describe("failures that must not redirect", () => {
  it("refuses an unregistered callback without contacting it", () => {
    const result = validate({ ...GOOD, redirect_uri: "https://evil.test/cb" });
    assert.equal(result.kind, "fatal");
  });

  it("refuses when a multi-redirect client names none", () => {
    const result = validate({ ...GOOD, redirect_uri: undefined }, NATIVE);
    assert.equal(result.kind, "fatal");
  });
});

describe("failures the client is told about", () => {
  it("refuses a response_type other than code", () => {
    const result = validate({ ...GOOD, response_type: "token" });
    assert.ok(result.kind === "redirect");
    assert.equal(result.error, "unsupported_response_type");
  });

  it("requires PKCE", () => {
    const result = validate({ ...GOOD, code_challenge: undefined });
    assert.ok(result.kind === "redirect");
    assert.equal(result.error, "invalid_request");
  });

  it("refuses the plain challenge method", () => {
    const result = validate({ ...GOOD, code_challenge_method: "plain" });
    assert.ok(result.kind === "redirect");
    assert.equal(result.error, "invalid_request");
  });

  it("refuses a malformed challenge", () => {
    const result = validate({ ...GOOD, code_challenge: "short" });
    assert.ok(result.kind === "redirect");
    assert.equal(result.error, "invalid_request");
  });

  it("refuses a token requested for someone else's server", () => {
    const result = validate({ ...GOOD, resource: "https://evil.test/api/mcp" });
    assert.ok(result.kind === "redirect");
    assert.equal(result.error, "invalid_target");
  });

  it("carries state back on an error, so the client can match it up", () => {
    const result = validate({ ...GOOD, response_type: "token" });
    assert.ok(result.kind === "redirect");
    assert.equal(result.state, "xyz");
  });
});

describe("building the redirect", () => {
  it("returns the code, state and issuer in the query", () => {
    const url = new URL(
      buildAuthorizationRedirect({
        redirectUri: "https://claude.ai/api/mcp/auth_callback",
        issuer: ISSUER,
        state: "xyz",
        result: { code: "osmcp_ac_x" },
      }),
    );
    assert.equal(url.searchParams.get("code"), "osmcp_ac_x");
    assert.equal(url.searchParams.get("state"), "xyz");
    assert.equal(url.searchParams.get("iss"), ISSUER);
    assert.equal(url.hash, "");
  });

  it("preserves a query the registered callback already carried", () => {
    const url = new URL(
      buildAuthorizationRedirect({
        redirectUri: "https://app.test/cb?tenant=acme",
        issuer: ISSUER,
        state: null,
        result: { code: "osmcp_ac_x" },
      }),
    );
    assert.equal(url.searchParams.get("tenant"), "acme");
    assert.equal(url.searchParams.get("code"), "osmcp_ac_x");
  });

  it("omits state when the client sent none", () => {
    const url = new URL(
      buildAuthorizationRedirect({
        redirectUri: "https://app.test/cb",
        issuer: ISSUER,
        state: null,
        result: { error: "access_denied", description: "no" },
      }),
    );
    assert.equal(url.searchParams.has("state"), false);
    assert.equal(url.searchParams.get("error"), "access_denied");
    assert.equal(url.searchParams.get("iss"), ISSUER);
  });
});
