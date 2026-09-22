import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { soloMcpPolicy, unconfiguredOrgMcpPolicy } from "./scopes";

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

describe("member access defaults", () => {
  it("lets every member of a solo install through", () => {
    const solo = soloMcpPolicy();
    assert.equal(solo.memberAccess, "all");
    assert.equal(solo.memberAllowed, true);
  });

  it("keeps an unconfigured org closed to everyone", () => {
    const org = unconfiguredOrgMcpPolicy();
    assert.equal(org.enabled, false);
    assert.equal(org.memberAllowed, false);
  });
});
