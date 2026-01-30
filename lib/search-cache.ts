import { createHash } from "node:crypto";
import { createClient } from "redis";

const SEARCH_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const CACHE_KEY_PREFIX = "cache";

let redisClient: Awaited<ReturnType<typeof createClient>> | null = null;

export function getSearchCacheKey(
  prefix: string,
  query: string,
  maxResults?: number,
): string {
  const normalized = query.trim().toLowerCase();
  const limit = String(maxResults ?? 5);
  const hash = createHash("sha256")
    .update(normalized)
    .update("\n")
    .update(limit)
    .digest("hex")
    .slice(0, 16);
  return `${CACHE_KEY_PREFIX}:${prefix}:${hash}`;
}

async function getClient(): Promise<Awaited<
  ReturnType<typeof createClient>
> | null> {
  const url = process.env.REDIS_URL;
  if (!url) {
    return null;
  }
  if (redisClient) {
    return redisClient;
  }
  try {
    const client = createClient({ url }).on("error", (err: Error) => {
      console.warn("[SearchCache] Redis client error:", err.message);
    });
    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.warn(
      "[SearchCache] Redis connect failed:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

export type CachedSearchPayload = {
  provider: string;
  domain: { id: string; label: string; url: string };
  query: string;
  results: { url: string; title: string; snippet: string; engine?: string }[];
  fetchedAt: string;
  metadata?: { siteFilter?: string };
};

export async function getCachedSearch(
  key: string,
): Promise<CachedSearchPayload | null> {
  const client = await getClient();
  if (!client) {
    return null;
  }
  try {
    const raw = await client.get(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as CachedSearchPayload;
  } catch {
    return null;
  }
}

export async function setCachedSearch(
  key: string,
  value: CachedSearchPayload,
  ttlSeconds: number = SEARCH_CACHE_TTL_SECONDS,
): Promise<void> {
  const client = await getClient();
  if (!client) {
    return;
  }
  try {
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (error) {
    console.warn(
      "[SearchCache] Redis set failed:",
      error instanceof Error ? error.message : String(error),
    );
  }
}
