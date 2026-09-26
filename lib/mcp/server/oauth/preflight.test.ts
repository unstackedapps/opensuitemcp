import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateConnectPreflight } from "./preflight";

describe("connect preflight", () => {
  it("is ready on a configured https origin", () => {
    const result = evaluateConnectPreflight({
      origin: "https://netsuite.acme.com",
      originIsConfigured: true,
    });
    assert.equal(result.status, "ready");
    assert.match(result.detail, /netsuite\.acme\.com/);
  });

  it("allows plain http on loopback, for local development", () => {
    assert.equal(
      evaluateConnectPreflight({
        origin: "http://localhost:3000",
        originIsConfigured: true,
      }).status,
      "ready",
    );
  });

  it("flags plain http on a real host, and points at agent keys instead", () => {
    const result = evaluateConnectPreflight({
      origin: "http://netsuite.acme.com",
      originIsConfigured: true,
    });
    assert.equal(result.status, "insecure");
    assert.match(result.detail, /agent key/);
  });

  it("flags a guessed origin before someone loses an hour to it", () => {
    const result = evaluateConnectPreflight({
      origin: "https://netsuite.acme.com",
      originIsConfigured: false,
    });
    assert.equal(result.status, "configure");
    assert.match(result.detail, /AUTH_URL/);
  });

  it("flags an origin it could not parse at all", () => {
    assert.equal(
      evaluateConnectPreflight({ origin: "nonsense", originIsConfigured: true })
        .status,
      "configure",
    );
  });
});
