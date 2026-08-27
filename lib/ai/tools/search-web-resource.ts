import { tool } from "ai";
import { z } from "zod";
import {
  type SearchResourceEntry,
  searchResourceSiteFilter,
  searchResourceToolDescription,
  searchResourceToolName,
} from "@/lib/ai/search-resources";
import {
  executeSearXNGDomainSearch,
  type WebSearchToolResult,
} from "@/lib/ai/web-search";
import {
  type CachedSearchPayload,
  getCachedSearch,
  getSearchCacheKey,
  setCachedSearch,
} from "@/lib/search-cache";

type SearchResourceToolOptions = {
  fetchImpl?: typeof fetch;
};

export function createSearchResourceTool(
  resource: SearchResourceEntry,
  options: SearchResourceToolOptions = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const siteFilter = searchResourceSiteFilter(resource.url);
  const cachePrefix = searchResourceToolName(resource);

  return tool({
    description: searchResourceToolDescription(resource),
    inputSchema: z.object({
      query: z
        .string()
        .min(1, "Provide a keyword or question to search for.")
        .describe("Search keywords or question."),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Maximum number of results to return (default 5)."),
    }),
    execute: async (
      input,
    ): Promise<WebSearchToolResult | { error: string }> => {
      const query = input.query.trim();
      const maxResults = input.maxResults ?? 5;

      const cacheKey = getSearchCacheKey(cachePrefix, query, maxResults);
      const cached = await getCachedSearch(cacheKey);
      if (cached) {
        return cached as WebSearchToolResult;
      }

      try {
        const result = await executeSearXNGDomainSearch({
          siteFilter,
          domainId: resource.catalogId ?? resource.id,
          domainLabel: resource.label,
          domainUrl: resource.url.endsWith("/")
            ? resource.url
            : `${resource.url}/`,
          query,
          maxResults,
          fetchImpl,
        });
        await setCachedSearch(cacheKey, result as CachedSearchPayload);
        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Search failed";
        return {
          error: `${resource.label} search failed: ${message}`,
        };
      }
    },
  });
}
