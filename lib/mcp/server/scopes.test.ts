import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyScopePolicy,
  soloMcpPolicy,
  unconfiguredOrgMcpPolicy,
} from "./scopes";

describe("applyScopePolicy", () => {
  it("grants write only when policy allows it", () => {
    assert.deepEqual(
      applyScopePolicy(["read", "write"], { allowWriteScope: true }),
      ["read", "write"],
    );
    assert.deepEqual(
      applyScopePolicy(["read", "write"], { allowWriteScope: false }),
      ["read"],
    );
  });

  it("always implies read, so no key is write-without-read", () => {
    assert.deepEqual(applyScopePolicy(["write"], { allowWriteScope: true }), [
      "read",
      "write",
    ]);
    assert.deepEqual(applyScopePolicy([], { allowWriteScope: true }), ["read"]);
  });

  it("deduplicates and returns a stable order", () => {
    assert.deepEqual(
      applyScopePolicy(["write", "read", "write"], { allowWriteScope: true }),
      ["read", "write"],
    );
  });
});

describe("policy defaults", () => {
  it("opens for solo installs and stays closed for unconfigured orgs", () => {
    const solo = soloMcpPolicy();
    assert.equal(solo.enabled, true);
    assert.equal(solo.allowWriteScope, true);
    assert.equal(solo.managedByOrg, false);

    const org = unconfiguredOrgMcpPolicy();
    assert.equal(org.enabled, false);
    assert.equal(org.allowWriteScope, false);
    assert.equal(org.managedByOrg, true);
  });
});
