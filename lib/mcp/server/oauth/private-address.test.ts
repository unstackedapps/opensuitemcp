import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPrivateAddress } from "./private-address";

describe("private address detection", () => {
  it("allows ordinary public addresses", () => {
    for (const address of [
      "8.8.8.8",
      "1.1.1.1",
      "160.79.104.1",
      "2606:4700::1",
    ]) {
      assert.equal(isPrivateAddress(address), false, address);
    }
  });

  it("rejects loopback, private and link-local v4", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.254",
      "192.168.1.1",
      "0.0.0.0",
      "100.64.0.1",
    ]) {
      assert.equal(isPrivateAddress(address), true, address);
    }
  });

  it("rejects the cloud metadata service", () => {
    assert.equal(isPrivateAddress("169.254.169.254"), true);
  });

  it("does not mistake a public 172 for the private block", () => {
    assert.equal(isPrivateAddress("172.15.0.1"), false);
    assert.equal(isPrivateAddress("172.32.0.1"), false);
  });

  it("rejects v6 loopback, unique-local and link-local", () => {
    for (const address of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1"]) {
      assert.equal(isPrivateAddress(address), true, address);
    }
  });

  it("sees through an IPv4-mapped v6 address", () => {
    assert.equal(isPrivateAddress("::ffff:169.254.169.254"), true);
    assert.equal(isPrivateAddress("::ffff:10.0.0.1"), true);
    assert.equal(isPrivateAddress("::ffff:8.8.8.8"), false);
  });

  it("strips brackets and zone ids", () => {
    assert.equal(isPrivateAddress("[::1]"), true);
    assert.equal(isPrivateAddress("fe80::1%eth0"), true);
  });

  it("fails closed on anything it cannot parse", () => {
    for (const address of ["", "   ", "not-an-address", "999.1.1.1"]) {
      assert.equal(isPrivateAddress(address), true, JSON.stringify(address));
    }
  });
});
