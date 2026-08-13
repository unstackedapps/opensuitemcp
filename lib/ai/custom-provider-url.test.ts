import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertAllowedProviderUrl,
  isBlockedIpAddress,
} from "./custom-provider-url";
import { openaiCompatibleModelsUrl } from "./provider-entries";

describe("custom-provider-url", () => {
  it("rejects http on public hostnames and non-http(s) schemes", async () => {
    await assert.rejects(
      () => assertAllowedProviderUrl("http://example.com"),
      /HTTP is only allowed/,
    );
    await assert.rejects(
      () => assertAllowedProviderUrl("ftp://localhost/v1"),
      /HTTP or HTTPS/,
    );
  });

  it("accepts localhost and IP addresses over http", async () => {
    const localhost = await assertAllowedProviderUrl(
      "http://localhost:11434/v1",
    );
    assert.equal(localhost.hostname, "localhost");

    const loopback = await assertAllowedProviderUrl(
      "http://127.0.0.1:11434/v1",
    );
    assert.equal(loopback.hostname, "127.0.0.1");

    const lan = await assertAllowedProviderUrl("http://192.168.1.10/v1");
    assert.equal(lan.hostname, "192.168.1.10");

    const ipv6 = await assertAllowedProviderUrl("http://[::1]:11434/v1");
    assert.ok(ipv6.hostname.includes("::1"));
  });

  it("accepts localhost over https", async () => {
    const url = await assertAllowedProviderUrl("https://localhost/v1");
    assert.equal(url.hostname, "localhost");
  });

  it("still blocks metadata and link-local IPs", async () => {
    await assert.rejects(
      () => assertAllowedProviderUrl("http://169.254.169.254/"),
      /not allowed/,
    );
    await assert.rejects(
      () => assertAllowedProviderUrl("https://metadata.google.internal/"),
      /not allowed/,
    );
  });

  it("blocks private and metadata IPs for DNS rebinding", () => {
    assert.equal(isBlockedIpAddress("127.0.0.1"), true);
    assert.equal(isBlockedIpAddress("10.0.0.4"), true);
    assert.equal(isBlockedIpAddress("192.168.1.8"), true);
    assert.equal(isBlockedIpAddress("169.254.169.254"), true);
    assert.equal(isBlockedIpAddress("::1"), true);
    assert.equal(isBlockedIpAddress("8.8.8.8"), false);
  });

  it("rejects DNS that resolves to a private IP", async () => {
    await assert.rejects(
      () =>
        assertAllowedProviderUrl("https://internal.example", async () => [
          "10.1.2.3",
        ]),
      /Private/,
    );
  });

  it("accepts public HTTPS after DNS resolve", async () => {
    const url = await assertAllowedProviderUrl(
      "https://llm.example.com/v1",
      async () => ["8.8.8.8"],
    );
    assert.equal(url.hostname, "llm.example.com");
  });

  it("builds /v1/models without doubling v1", () => {
    assert.equal(
      openaiCompatibleModelsUrl("https://api.example.com/v1"),
      "https://api.example.com/v1/models",
    );
    assert.equal(
      openaiCompatibleModelsUrl("https://api.example.com"),
      "https://api.example.com/v1/models",
    );
  });
});
