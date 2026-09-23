import "server-only";

import {
  builtinSearchResource,
  ORACLE_HELP_CATALOG_ID,
  searchResourceSiteFilter,
} from "@/lib/ai/search-resources";
import { executeSearXNGDomainSearch } from "@/lib/ai/web-search";
import {
  type CachedSearchPayload,
  getCachedSearch,
  getSearchCacheKey,
  setCachedSearch,
} from "@/lib/search-cache";
import { type McpToolDefinition, toolError, toolResult } from "./types";

const DEFAULT_RESULTS = 5;
const MAX_RESULTS = 10;

const searchNetSuiteDocs: McpToolDefinition = {
  name: "osmcp_search_netsuite_docs",
  title: "Search NetSuite documentation",
  description:
    "Search the official Oracle NetSuite Help Center. Use it for standard UI navigation, permission setup, SuiteScript and SuiteQL references, record and field semantics, and security guidance — the foundational truth behind a NetSuite question. Prefer it over recalling NetSuite behaviour from memory, especially before writing a query or changing a record.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search keywords or a question.",
      },
      maxResults: {
        type: "integer",
        minimum: 1,
        maximum: MAX_RESULTS,
        description: `Maximum results to return (default ${DEFAULT_RESULTS}).`,
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  annotations: {
    title: "Search NetSuite documentation",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    // Reaches the public Oracle Help Center rather than this workspace.
    openWorldHint: true,
  },
  execute: async (args) => {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) {
      return toolError("Pass a `query` — keywords or a question to look up.");
    }

    const requested =
      typeof args.maxResults === "number" && Number.isFinite(args.maxResults)
        ? Math.trunc(args.maxResults)
        : DEFAULT_RESULTS;
    const maxResults = Math.min(Math.max(requested, 1), MAX_RESULTS);

    const builtin = builtinSearchResource(ORACLE_HELP_CATALOG_ID);
    const label = builtin?.label ?? "Oracle NetSuite Help Center";
    const url =
      builtin?.url ?? "https://docs.oracle.com/en/cloud/saas/netsuite";

    const cacheKey = getSearchCacheKey("searchNetsuiteDocs", query, maxResults);
    const cached = (await getCachedSearch(cacheKey)) as
      | Awaited<ReturnType<typeof executeSearXNGDomainSearch>>
      | null
      | undefined;

    let result = cached ?? null;
    if (!result) {
      try {
        result = await executeSearXNGDomainSearch({
          siteFilter: searchResourceSiteFilter(url),
          domainId: ORACLE_HELP_CATALOG_ID,
          domainLabel: label,
          domainUrl: url.endsWith("/") ? url : `${url}/`,
          query,
          maxResults,
          fetchImpl: fetch,
        });
        await setCachedSearch(cacheKey, result as CachedSearchPayload);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Search failed";
        // Search runs through this install's own SearXNG. A self-host without
        // one reaches here, and no retry will change that.
        return toolError(
          `${label} search is unavailable on this OpenSuiteMCP install: ${message}. Answer from the NetSuite tools instead of retrying.`,
        );
      }
    }

    const rows = result.results.map((entry) => ({
      title: entry.title,
      url: entry.url,
      snippet: entry.snippet,
    }));

    if (rows.length === 0) {
      return toolResult(
        { columns: ["title", "url", "snippet"], rows, query, source: label },
        `No ${label} results for "${query}". Try different keywords.`,
      );
    }

    return toolResult(
      {
        columns: ["title", "url", "snippet"],
        rows,
        query,
        source: label,
        fetchedAt: result.fetchedAt,
      },
      rows
        .map((row) => `${row.title}\n${row.url}\n${row.snippet}`)
        .join("\n\n"),
    );
  },
};

export const searchTools: McpToolDefinition[] = [searchNetSuiteDocs];
