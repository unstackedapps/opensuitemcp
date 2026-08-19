import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMcpToolsListCache } from "./mcp-tools-cache";

describe("mcp-tools-cache", () => {
  it("returns fresh values within TTL and stale until hard TTL", () => {
    let now = 1000;
    const cache = createMcpToolsListCache<string[]>(1000, 5000, () => now);

    cache.set("user-1", "acct-1", ["ns_getRecord"]);
    assert.deepEqual(cache.get("user-1", "acct-1"), ["ns_getRecord"]);
    assert.equal(cache.getLookup("user-1", "acct-1")?.fresh, true);

    now = 1999;
    assert.deepEqual(cache.get("user-1", "acct-1"), ["ns_getRecord"]);

    now = 2000;
    assert.equal(cache.get("user-1", "acct-1"), undefined);
    const stale = cache.getLookup("user-1", "acct-1");
    assert.deepEqual(stale?.value, ["ns_getRecord"]);
    assert.equal(stale?.fresh, false);

    now = 6000;
    assert.equal(cache.getLookup("user-1", "acct-1"), undefined);
  });

  it("coalesces in-flight fetches for the same account", async () => {
    const cache = createMcpToolsListCache<string[]>(60_000);
    let fetches = 0;
    let release: ((value: string[]) => void) | undefined;
    const gate = new Promise<string[]>((resolve) => {
      release = resolve;
    });

    const first = cache.getOrFetch(
      "user-1",
      "acct-1",
      async () => {
        fetches += 1;
        return gate;
      },
      (tools) => tools.length > 0,
    );
    const second = cache.getOrFetch(
      "user-1",
      "acct-1",
      async () => {
        fetches += 1;
        return ["should-not-run"];
      },
      (tools) => tools.length > 0,
    );

    release?.(["ns_runReport"]);
    assert.deepEqual(await first, ["ns_runReport"]);
    assert.deepEqual(await second, ["ns_runReport"]);
    assert.equal(fetches, 1);
    assert.deepEqual(cache.get("user-1", "acct-1"), ["ns_runReport"]);
  });

  it("does not cache empty lists", async () => {
    const cache = createMcpToolsListCache<string[]>(60_000);
    let fetches = 0;

    const empty = await cache.getOrFetch(
      "user-1",
      "acct-1",
      async () => {
        fetches += 1;
        return [];
      },
      (tools) => tools.length > 0,
    );
    assert.deepEqual(empty, []);
    assert.equal(cache.get("user-1", "acct-1"), undefined);

    const next = await cache.getOrFetch(
      "user-1",
      "acct-1",
      async () => {
        fetches += 1;
        return ["ns_getRecord"];
      },
      (tools) => tools.length > 0,
    );
    assert.deepEqual(next, ["ns_getRecord"]);
    assert.equal(fetches, 2);
  });

  it("invalidates one account or all accounts for a user", () => {
    const cache = createMcpToolsListCache<string[]>(60_000);
    cache.set("user-1", "acct-1", ["a"]);
    cache.set("user-1", "acct-2", ["b"]);
    cache.set("user-2", "acct-1", ["c"]);

    cache.invalidate("user-1", "acct-1");
    assert.equal(cache.get("user-1", "acct-1"), undefined);
    assert.deepEqual(cache.get("user-1", "acct-2"), ["b"]);
    assert.deepEqual(cache.get("user-2", "acct-1"), ["c"]);

    cache.invalidate("user-1");
    assert.equal(cache.get("user-1", "acct-2"), undefined);
    assert.deepEqual(cache.get("user-2", "acct-1"), ["c"]);
  });

  it("honors fetchedAt when seeding from durable storage", () => {
    const now = 10_000;
    const cache = createMcpToolsListCache<string[]>(1000, 5000, () => now);
    cache.set("user-1", "acct-1", ["ns_runReport"], 8500);
    assert.equal(cache.getLookup("user-1", "acct-1")?.fresh, false);
    assert.deepEqual(cache.getLookup("user-1", "acct-1")?.value, [
      "ns_runReport",
    ]);
  });
});
