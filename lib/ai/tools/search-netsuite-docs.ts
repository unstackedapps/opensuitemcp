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

const SITE_FILTER = "site:docs.oracle.com/en/cloud/saas/netsuite";
const DOMAIN_ID = "netsuite-docs";
const DOMAIN_LABEL = "Oracle NetSuite Help Center";
const DOMAIN_URL = "https://docs.oracle.com/en/cloud/saas/netsuite/";
const CACHE_PREFIX = "netsuite_docs";

type SearchNetsuiteDocsOptions = {
  fetchImpl?: typeof fetch;
};

export function createSearchNetsuiteDocsTool(
  options: SearchNetsuiteDocsOptions = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;

  return tool({
    description:
      "Official Oracle NetSuite Help Center. Use this for foundational truth, standard UI navigation, permission setup, official SuiteScript API references, and security best practices. Priority 1 for 'How-to' questions regarding native features and core ERP modules.",
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
          error: `NetSuite docs search failed: ${message}`,
        };
      }
    },
  });
}
