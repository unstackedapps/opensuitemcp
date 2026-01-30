import { tool } from "ai";
import { z } from "zod";
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

const SITE_FILTER = "site:timdietrich.me/blog";
const DOMAIN_ID = "tim-dietrich";
const DOMAIN_LABEL = "Tim Dietrich Knowledge Base";
const DOMAIN_URL = "https://timdietrich.me/blog";
const CACHE_PREFIX = "dietrich";

type SearchTimDietrichOptions = {
  fetchImpl?: typeof fetch;
};

export function createSearchTimDietrichTool(
  options: SearchTimDietrichOptions = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;

  return tool({
    description:
      "Expert NetSuite Developer Knowledge Base. Priority 1 for SuiteQL query construction, advanced SuiteScript debugging, and financial prompt engineering. Use this when the user needs to build custom reports, optimize data fetching, or troubleshoot the 'Silent Filter Inheritance' and MCP authentication issues.",
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

      const cacheKey = getSearchCacheKey(CACHE_PREFIX, query, maxResults);
      const cached = await getCachedSearch(cacheKey);
      if (cached) {
        return cached as WebSearchToolResult;
      }

      try {
        const result = await executeSearXNGDomainSearch({
          siteFilter: SITE_FILTER,
          domainId: DOMAIN_ID,
          domainLabel: DOMAIN_LABEL,
          domainUrl: DOMAIN_URL,
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
          error: `Tim Dietrich search failed: ${message}`,
        };
      }
    },
  });
}
