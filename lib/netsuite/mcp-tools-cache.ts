type CacheEntry<T> = {
  value: T;
  /** Serve without network refresh until this time. */
  freshUntil: number;
  /** Serve as stale (background refresh) until this time. */
  staleUntil: number;
};

export type McpToolsCacheLookup<T> = {
  value: T;
  fresh: boolean;
};

/** How long tools/list is considered fresh (no background refresh). */
export const MCP_TOOLS_LIST_TTL_MS = 30 * 60 * 1000;

/** How long we will still serve a stale catalog instead of blocking on NetSuite. */
export const MCP_TOOLS_LIST_STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createMcpToolsListCache<T>(
  freshTtlMs: number,
  staleTtlMs: number = MCP_TOOLS_LIST_STALE_TTL_MS,
  now: () => number = Date.now,
) {
  const entries = new Map<string, CacheEntry<T>>();
  const inflight = new Map<string, Promise<T>>();

  const keyFor = (userId: string, accountId: string) =>
    `${userId}:${accountId}`;

  const prune = (current: number) => {
    for (const [key, entry] of entries) {
      if (entry.staleUntil <= current) {
        entries.delete(key);
      }
    }
  };

  const getLookup = (
    userId: string,
    accountId: string,
  ): McpToolsCacheLookup<T> | undefined => {
    const current = now();
    const key = keyFor(userId, accountId);
    const entry = entries.get(key);
    if (!entry || entry.staleUntil <= current) {
      entries.delete(key);
      return;
    }
    return {
      value: entry.value,
      fresh: entry.freshUntil > current,
    };
  };

  /** Fresh values only — undefined when missing or stale. */
  const get = (userId: string, accountId: string): T | undefined => {
    const lookup = getLookup(userId, accountId);
    if (!lookup?.fresh) {
      return;
    }
    return lookup.value;
  };

  const set = (
    userId: string,
    accountId: string,
    value: T,
    fetchedAt: number = now(),
  ) => {
    const current = now();
    prune(current);
    entries.set(keyFor(userId, accountId), {
      value,
      freshUntil: fetchedAt + freshTtlMs,
      staleUntil: fetchedAt + staleTtlMs,
    });
  };

  const invalidate = (userId: string, accountId?: string | null) => {
    if (accountId?.trim()) {
      const key = keyFor(userId, accountId.trim());
      entries.delete(key);
      inflight.delete(key);
      return;
    }
    const prefix = `${userId}:`;
    for (const key of entries.keys()) {
      if (key.startsWith(prefix)) {
        entries.delete(key);
      }
    }
    for (const key of inflight.keys()) {
      if (key.startsWith(prefix)) {
        inflight.delete(key);
      }
    }
  };

  const getOrFetch = (
    userId: string,
    accountId: string,
    fetchFn: () => Promise<T>,
    shouldCache: (value: T) => boolean,
  ): Promise<T> => {
    const fresh = get(userId, accountId);
    if (fresh !== undefined) {
      return Promise.resolve(fresh);
    }
    const key = keyFor(userId, accountId);
    const pending = inflight.get(key);
    if (pending) {
      return pending;
    }
    const request = fetchFn()
      .then((value) => {
        if (shouldCache(value)) {
          set(userId, accountId, value);
        }
        return value;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, request);
    return request;
  };

  return { get, getLookup, set, invalidate, getOrFetch };
}
