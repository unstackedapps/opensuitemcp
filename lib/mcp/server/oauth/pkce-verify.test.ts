import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateCodeChallenge,
  generateCodeVerifier,
} from "@/lib/netsuite/oauth/pkce";
import {
  isValidCodeChallenge,
  isValidCodeVerifier,
  verifyCodeChallenge,
} from "./pkce-verify";

describe("pkce verification", () => {
  it("accepts a verifier the client's own generator produced", () => {
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    assert.equal(
      verifyCodeChallenge({ verifier, challenge, method: "S256" }),
      true,
    );
  });

  it("defaults to S256 when the token request omits the method", () => {
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    assert.equal(verifyCodeChallenge({ verifier, challenge }), true);
  });

  it("rejects a verifier that does not hash to the stored challenge", () => {
    const challenge = generateCodeChallenge(generateCodeVerifier());
    assert.equal(
      verifyCodeChallenge({ verifier: generateCodeVerifier(), challenge }),
      false,
    );
  });

  it("refuses plain, which OAuth 2.1 removed", () => {
    const verifier = generateCodeVerifier();
    assert.equal(
      verifyCodeChallenge({ verifier, challenge: verifier, method: "plain" }),
      false,
    );
  });

  it("refuses a malformed verifier before hashing it", () => {
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    assert.equal(
      verifyCodeChallenge({ verifier: "too-short", challenge }),
      false,
    );
    assert.equal(
      verifyCodeChallenge({ verifier: `${verifier}!`, challenge }),
      false,
    );
  });

  it("refuses a challenge that is not a base64url digest", () => {
    const verifier = generateCodeVerifier();
    assert.equal(verifyCodeChallenge({ verifier, challenge: "short" }), false);
  });
});

describe("pkce parameter shapes", () => {
  it("bounds the verifier at RFC 7636's 43 and 128 characters", () => {
    assert.equal(isValidCodeVerifier("a".repeat(42)), false);
    assert.equal(isValidCodeVerifier("a".repeat(43)), true);
    assert.equal(isValidCodeVerifier("a".repeat(128)), true);
    assert.equal(isValidCodeVerifier("a".repeat(129)), false);
  });

  it("requires a challenge to be exactly one base64url digest", () => {
    assert.equal(isValidCodeChallenge("a".repeat(43)), true);
    assert.equal(isValidCodeChallenge("a".repeat(44)), false);
    assert.equal(isValidCodeChallenge(`${"a".repeat(42)}+`), false);
  });
});
