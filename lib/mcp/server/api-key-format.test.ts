import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateMcpApiKey,
  hashMcpKeySecret,
  MCP_KEY_PREFIX,
  maskMcpApiKey,
  mcpKeySecretMatches,
  parseMcpApiKey,
  readBearerToken,
} from "./api-key-format";

describe("generateMcpApiKey", () => {
  it("mints a parseable key whose hash matches the secret", () => {
    const minted = generateMcpApiKey();
    assert.ok(minted.token.startsWith(MCP_KEY_PREFIX));

    const parsed = parseMcpApiKey(minted.token);
    assert.ok(parsed);
    assert.equal(parsed.tokenId, minted.tokenId);
    assert.equal(hashMcpKeySecret(parsed.secret), minted.tokenHash);
    assert.ok(mcpKeySecretMatches(parsed.secret, minted.tokenHash));
  });

  it("never repeats a token id or secret", () => {
    const first = generateMcpApiKey();
    const second = generateMcpApiKey();
    assert.notEqual(first.tokenId, second.tokenId);
    assert.notEqual(first.tokenHash, second.tokenHash);
  });

  it("does not leak the secret through the stored hash", () => {
    const minted = generateMcpApiKey();
    const secret = parseMcpApiKey(minted.token)?.secret ?? "";
    assert.ok(secret.length > 0);
    assert.ok(!minted.tokenHash.includes(secret));
  });
});

describe("parseMcpApiKey", () => {
  it("accepts a secret containing base64url separator characters", () => {
    const tokenId = "0123456789abcdef";
    const secret = "aa-bb_cc-dd_ee";
    const parsed = parseMcpApiKey(`${MCP_KEY_PREFIX}${tokenId}_${secret}`);
    assert.equal(parsed?.tokenId, tokenId);
    assert.equal(parsed?.secret, secret);
  });

  it("tolerates surrounding whitespace", () => {
    const minted = generateMcpApiKey();
    assert.deepEqual(
      parseMcpApiKey(`  ${minted.token}\n`),
      parseMcpApiKey(minted.token),
    );
  });

  it("rejects malformed keys", () => {
    const cases: string[] = [
      "",
      "   ",
      "sk-live-abcdef",
      MCP_KEY_PREFIX,
      `${MCP_KEY_PREFIX}0123456789abcdef`,
      `${MCP_KEY_PREFIX}0123456789abcdef_`,
      `${MCP_KEY_PREFIX}0123456789abcde_secret`,
      `${MCP_KEY_PREFIX}0123456789abcdeZ_secret`,
      `${MCP_KEY_PREFIX}0123456789ABCDEF_secret`,
      `${MCP_KEY_PREFIX}0123456789abcdef-secret`,
    ];
    for (const value of cases) {
      assert.equal(parseMcpApiKey(value), null, `expected null for ${value}`);
    }
  });
});

describe("mcpKeySecretMatches", () => {
  it("rejects a wrong secret and a wrong-length digest", () => {
    const minted = generateMcpApiKey();
    assert.equal(
      mcpKeySecretMatches("not-the-secret", minted.tokenHash),
      false,
    );
    assert.equal(mcpKeySecretMatches("anything", "short"), false);
  });
});

describe("maskMcpApiKey", () => {
  it("shows the token id but no secret material", () => {
    const masked = maskMcpApiKey("0123456789abcdef");
    assert.ok(masked.startsWith(`${MCP_KEY_PREFIX}0123456789abcdef_`));
    assert.ok(!masked.includes("="));
  });
});

describe("readBearerToken", () => {
  it("reads a token regardless of header casing and spacing", () => {
    assert.equal(readBearerToken("Bearer abc"), "abc");
    assert.equal(readBearerToken("bearer   abc"), "abc");
    assert.equal(readBearerToken("  Bearer\tabc  "), "abc");
  });

  it("returns null when absent or not a bearer scheme", () => {
    assert.equal(readBearerToken(null), null);
    assert.equal(readBearerToken(""), null);
    assert.equal(readBearerToken("Basic abc"), null);
    assert.equal(readBearerToken("Bearer"), null);
    assert.equal(readBearerToken("Bearer   "), null);
  });
});
