import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  soloMcpPolicy,
  unconfiguredOrgMcpPolicy,
} from "./scopes";

describe("policy defaults", () => {
  it("opens for solo installs and stays closed for unconfigured orgs", () => {
    const solo = soloMcpPolicy();
    assert.equal(solo.enabled, true);
    assert.equal(solo.managedByOrg, false);

    const org = unconfiguredOrgMcpPolicy();
    assert.equal(org.enabled, false);
    assert.equal(org.managedByOrg, true);
  });
});
