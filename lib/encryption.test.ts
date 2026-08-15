import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decrypt, decryptStoredSecret, encrypt } from "./encryption";

process.env.ENCRYPTION_KEY = "a".repeat(32);

describe("encryption", () => {
  it("round-trips AES-256-GCM and uses a unique IV each time", () => {
    const plaintext = "ns-oauth-access-token";
    const first = encrypt(plaintext);
    const second = encrypt(plaintext);
    assert.notEqual(first, second);
    assert.notEqual(first, plaintext);
    assert.equal(decrypt(first), plaintext);
    assert.equal(decrypt(second), plaintext);
  });

  it("decryptStoredSecret reports ciphertext vs legacy plaintext", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJuZXRzdWl0ZSJ9.signature";
    const stored = decryptStoredSecret(jwt);
    assert.equal(stored.plaintext, jwt);
    assert.equal(stored.encrypted, false);

    const ciphertext = encrypt(jwt);
    const decrypted = decryptStoredSecret(ciphertext);
    assert.equal(decrypted.plaintext, jwt);
    assert.equal(decrypted.encrypted, true);
  });

  it("rejects tampered ciphertext instead of treating it as plaintext", () => {
    const ciphertext = encrypt("refresh-token");
    const combined = Buffer.from(ciphertext, "base64");
    combined[combined.length - 1] ^= 1;
    const tampered = combined.toString("base64");
    assert.throws(() => decrypt(tampered));
    assert.throws(() => decryptStoredSecret(tampered), /ENCRYPTION_KEY/);
  });
});
