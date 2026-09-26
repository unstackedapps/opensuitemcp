import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeResourceUri,
  resolveResource,
  resourceMatches,
} from "./resource";

const SERVER = "https://netsuite.acme.com/api/mcp";

describe("resource canonicalization", () => {
  it("lowercases scheme and host but keeps the path", () => {
    assert.equal(
      canonicalizeResourceUri("HTTPS://NetSuite.Acme.com/api/mcp"),
      "https://netsuite.acme.com/api/mcp",
    );
  });

  it("drops a default port and keeps a meaningful one", () => {
    assert.equal(
      canonicalizeResourceUri("https://host:443/api/mcp"),
      "https://host/api/mcp",
    );
    assert.equal(
      canonicalizeResourceUri("https://host:8443/api/mcp"),
      "https://host:8443/api/mcp",
    );
  });

  it("treats a bare trailing slash as the same resource", () => {
    assert.equal(canonicalizeResourceUri("https://host/"), "https://host");
    assert.equal(
      canonicalizeResourceUri("https://host/api/mcp/"),
      "https://host/api/mcp",
    );
  });

  it("rejects a fragment, which RFC 8707 forbids", () => {
    assert.equal(canonicalizeResourceUri("https://host/api/mcp#x"), null);
  });

  it("rejects a value with no scheme", () => {
    assert.equal(canonicalizeResourceUri("netsuite.acme.com/api/mcp"), null);
  });
});

describe("resource matching", () => {
  it("accepts the same server spelled differently", () => {
    assert.equal(
      resourceMatches(SERVER, "HTTPS://NetSuite.Acme.com/api/mcp/"),
      true,
    );
  });

  it("does not treat the origin as the endpoint", () => {
    assert.equal(resourceMatches(SERVER, "https://netsuite.acme.com"), false);
  });

  it("refuses another host", () => {
    assert.equal(resourceMatches(SERVER, "https://evil.test/api/mcp"), false);
  });
});

describe("resolving the audience", () => {
  it("defaults to this server when the client sends nothing", () => {
    assert.deepEqual(
      resolveResource({ requested: null, serverResource: SERVER }),
      {
        ok: true,
        resource: SERVER,
      },
    );
    assert.deepEqual(
      resolveResource({ requested: "  ", serverResource: SERVER }),
      {
        ok: true,
        resource: SERVER,
      },
    );
  });

  it("accepts a client that does send it", () => {
    assert.deepEqual(
      resolveResource({ requested: `${SERVER}/`, serverResource: SERVER }),
      { ok: true, resource: SERVER },
    );
  });

  it("refuses to quietly substitute our own identifier for someone else's", () => {
    assert.deepEqual(
      resolveResource({
        requested: "https://evil.test/api/mcp",
        serverResource: SERVER,
      }),
      { ok: false, error: "invalid_target" },
    );
  });
});
