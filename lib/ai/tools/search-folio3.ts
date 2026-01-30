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

const SITE_FILTER = "site:netsuite.folio3.com/blog";
const DOMAIN_ID = "folio3";
const DOMAIN_LABEL = "Folio3 Knowledge Base";
const DOMAIN_URL = "https://netsuite.folio3.com/blog";
const CACHE_PREFIX = "folio3";

type SearchFolio3Options = {
  fetchImpl?: typeof fetch;
};

export function createSearchFolio3Tool(options: SearchFolio3Options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;

  return tool({
    description:
      "NetSuite Integration and MCP Connection Specialist. Priority 1 for Model Context Protocol (MCP) setup, connecting AI assistants (Claude/ChatGPT) to NetSuite, and custom API-driven workflows. Use this for industry-specific 'hacks,' automated reconciliation, and conversational data analysis setups.",
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
          error: `Folio3 search failed: ${message}`,
        };
      }
    },
  });
}
