import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMcpApiKey } from "../api-key-format";
import {
  generateOAuthToken,
  hashOAuthTokenSecret,
  isOAuthToken,
  oauthTokenSecretMatches,
  parseOAuthToken,
} from "./token-format";

describe("oauth token format", () => {
  it("round-trips every kind", () => {
    for (const kind of ["access", "refresh", "code"] as const) {
      const minted = generateOAuthToken(kind);
      const parsed = parseOAuthToken(minted.token);
      assert.ok(parsed, `${kind} should parse`);
      assert.equal(parsed.kind, kind);
      assert.equal(parsed.tokenId, minted.tokenId);
      assert.equal(hashOAuthTokenSecret(parsed.secret), minted.tokenHash);
    }
  });

  it("gives each kind its own prefix, so a refresh token is not an access token", () => {
    const access = generateOAuthToken("access");
    const refresh = generateOAuthToken("refresh");
    assert.ok(access.token.startsWith("osmcp_at_"));
    assert.ok(refresh.token.startsWith("osmcp_rt_"));
    assert.equal(parseOAuthToken(refresh.token)?.kind, "refresh");
  });

  it("stores only a digest, never the secret", () => {
    const minted = generateOAuthToken("access");
    assert.ok(!minted.token.includes(minted.tokenHash));
    assert.equal(minted.tokenHash.length, 64);
  });

  it("matches a secret in constant time and rejects a near miss", () => {
    const minted = generateOAuthToken("access");
    const secret = parseOAuthToken(minted.token)?.secret ?? "";
    assert.equal(oauthTokenSecretMatches(secret, minted.tokenHash), true);
    assert.equal(
      oauthTokenSecretMatches(`${secret}x`, minted.tokenHash),
      false,
    );
    assert.equal(oauthTokenSecretMatches(secret, "deadbeef"), false);
  });

  it("rejects malformed credentials", () => {
    assert.equal(parseOAuthToken("osmcp_at_"), null);
    assert.equal(parseOAuthToken("osmcp_at_notahexid_secret"), null);
    assert.equal(parseOAuthToken("osmcp_at_0123456789abcdefsecret"), null);
    assert.equal(parseOAuthToken("osmcp_at_0123456789abcdef_"), null);
    assert.equal(parseOAuthToken("osmcp_xx_0123456789abcdef_secret"), null);
    assert.equal(parseOAuthToken(""), null);
  });

  it("is recognisable by prefix without a full parse", () => {
    assert.equal(isOAuthToken(generateOAuthToken("access").token), true);
    assert.equal(isOAuthToken("osmcp_0123456789abcdef_secret"), false);
  });
});

describe("no collision with the API key format", () => {
  it("an OAuth token never parses as an API key", () => {
    for (const kind of ["access", "refresh", "code"] as const) {
      assert.equal(parseMcpApiKey(generateOAuthToken(kind).token), null);
    }
  });

  it("an API key never parses as an OAuth token", () => {
    assert.equal(parseOAuthToken("osmcp_0123456789abcdef_secretvalue"), null);
  });
});
