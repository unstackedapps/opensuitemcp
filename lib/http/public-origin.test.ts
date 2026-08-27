/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSafeAppPath, publicAppUrl, sanitizeReturnTo } from "./public-origin";

describe("isSafeAppPath", () => {
  it("accepts same-origin relative paths", () => {
    assert.equal(isSafeAppPath("/"), true);
    assert.equal(isSafeAppPath("/admin/netsuite/mcp"), true);
    assert.equal(isSafeAppPath("/?settings=netsuite"), true);
  });

  it("rejects protocol-relative open redirects", () => {
    assert.equal(isSafeAppPath("//evil.com"), false);
    assert.equal(isSafeAppPath("//evil.com/phish"), false);
  });

  it("rejects missing or non-relative values", () => {
    assert.equal(isSafeAppPath(null), false);
    assert.equal(isSafeAppPath("https://evil.com"), false);
    assert.equal(isSafeAppPath("evil.com"), false);
  });
});

describe("publicAppUrl", () => {
  it("does not resolve //evil.com as an external origin", () => {
    const url = publicAppUrl("//evil.com", new Request("https://app.example/"));
    assert.notEqual(url.hostname, "evil.com");
    assert.equal(url.pathname, "/");
  });

  it("keeps a same-origin relative path", () => {
    const url = publicAppUrl(
      "/onboarding?step=mcp",
      new Request("https://app.example/"),
    );
    assert.notEqual(url.hostname, "evil.com");
    assert.equal(url.pathname, "/onboarding");
    assert.equal(url.search, "?step=mcp");
  });
});

describe("sanitizeReturnTo", () => {
  it("falls back for protocol-relative paths", () => {
    assert.equal(sanitizeReturnTo("//evil.com", "/login"), "/login");
  });
});
