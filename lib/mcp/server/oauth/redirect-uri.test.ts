import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAllowedRedirectUriShape,
  isLoopbackOnlyClient,
  isLoopbackRedirectUri,
  redirectUriMatches,
  resolveRedirectUri,
} from "./redirect-uri";

const CLAUDE_CODE = ["http://localhost/callback", "http://127.0.0.1/callback"];

describe("redirect uri shape", () => {
  it("accepts https anywhere and http only on loopback", () => {
    assert.equal(
      isAllowedRedirectUriShape("https://claude.ai/api/mcp/auth_callback"),
      true,
    );
    assert.equal(
      isAllowedRedirectUriShape("http://127.0.0.1:1410/callback"),
      true,
    );
    assert.equal(
      isAllowedRedirectUriShape("http://example.com/callback"),
      false,
    );
  });

  it("rejects a fragment, which would strand the authorization response", () => {
    assert.equal(
      isAllowedRedirectUriShape("https://app.example/cb#done"),
      false,
    );
  });

  it("rejects anything that is not a URL", () => {
    assert.equal(isAllowedRedirectUriShape("not a uri"), false);
    assert.equal(isLoopbackRedirectUri("not a uri"), false);
  });
});

describe("loopback matching", () => {
  it("ignores the port that a native client bound this session", () => {
    assert.equal(
      resolveRedirectUri(CLAUDE_CODE, "http://localhost:3118/callback"),
      "http://localhost:3118/callback",
    );
    assert.equal(
      resolveRedirectUri(CLAUDE_CODE, "http://127.0.0.1:52341/callback"),
      "http://127.0.0.1:52341/callback",
    );
  });

  it("does not treat localhost and 127.0.0.1 as the same host", () => {
    assert.equal(
      redirectUriMatches(
        "http://localhost/callback",
        "http://127.0.0.1/callback",
      ),
      false,
    );
  });

  it("still requires the path and query to agree", () => {
    assert.equal(
      resolveRedirectUri(CLAUDE_CODE, "http://localhost:3118/evil"),
      null,
    );
    assert.equal(
      resolveRedirectUri(CLAUDE_CODE, "http://localhost:3118/callback?next=1"),
      null,
    );
  });

  it("never relaxes the port for a non-loopback host", () => {
    assert.equal(
      redirectUriMatches(
        "https://claude.ai/api/mcp/auth_callback",
        "https://claude.ai:8443/api/mcp/auth_callback",
      ),
      false,
    );
  });
});

describe("exact matching", () => {
  it("matches a hosted callback verbatim", () => {
    const registered = ["https://claude.ai/api/mcp/auth_callback"];
    assert.equal(
      resolveRedirectUri(registered, "https://claude.ai/api/mcp/auth_callback"),
      "https://claude.ai/api/mcp/auth_callback",
    );
  });

  it("refuses a lookalike host", () => {
    const registered = ["https://claude.ai/api/mcp/auth_callback"];
    assert.equal(
      resolveRedirectUri(
        registered,
        "https://claude.ai.evil.test/api/mcp/auth_callback",
      ),
      null,
    );
  });

  it("refuses an unregistered redirect entirely", () => {
    assert.equal(
      resolveRedirectUri([], "https://claude.ai/api/mcp/auth_callback"),
      null,
    );
  });
});

describe("loopback-only clients", () => {
  it("flags a native client so the consent screen can warn", () => {
    assert.equal(isLoopbackOnlyClient(CLAUDE_CODE), true);
    assert.equal(
      isLoopbackOnlyClient(["https://claude.ai/api/mcp/auth_callback"]),
      false,
    );
    assert.equal(isLoopbackOnlyClient([]), false);
  });
});
