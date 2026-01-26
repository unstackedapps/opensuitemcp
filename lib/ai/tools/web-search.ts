import { tool } from "ai";
import { z } from "zod";
import {
  buildSearchConfig,
  getSearchDomainById,
  getSearchDomainStatus,
  getSearchDomainUrl,
  type SearchConfig,
  type SearchDomain,
} from "@/lib/ai/search-domains";

type WebSearchOptions = {
  selectedDomainIds?: string[] | null;
  environment?: string;
  fetchImpl?: typeof fetch;
};

type SearXNGResult = {
  url: string;
  title: string;
  content: string;
  engine: string;
};

export type WebSearchToolResult = {
  provider: string;
  domain: {
    id: string;
    label: string;
    url: string;
  };
  query: string;
  results: {
    url: string;
    title: string;
    snippet: string;
    engine?: string;
  }[];
  fetchedAt: string;
  metadata?: {
    siteFilter?: string;
  };
};

const LEADING_SLASH_REGEX = /^\/+/;
const TRAILING_SLASH_REGEX = /\/+$/;

export function buildSiteFilter(domain: SearchDomain): string {
  const path = domain.path ? domain.path.replace(LEADING_SLASH_REGEX, "") : "";
  if (path) {
    return `site:${domain.hostname}/${path}`;
  }
  return `site:${domain.hostname}`;
}

function getSearXNGEndpoint(): string {
  const endpoint = process.env.SEARXNG_ENDPOINT;
  if (!endpoint) {
    throw new Error(
      "SEARXNG_ENDPOINT environment variable is required. Please set it in your .env.local file.",
    );
  }
  // Ensure the endpoint doesn't have a trailing slash
  return endpoint.replace(TRAILING_SLASH_REGEX, "");
}

export async function searchSearXNG(
  query: string,
  fetchImpl: typeof fetch,
): Promise<SearXNGResult[]> {
  const endpoint = getSearXNGEndpoint();
  const searchUrl = new URL(`${endpoint}/search`);
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("format", "json");
  // Don't restrict to just Google - let SearXNG use all available engines
  // This gives better results when Google is blocked or rate-limited
  // searchUrl.searchParams.set("engines", "google");

  console.log("[WebSearch] Searching SearXNG", {
    endpoint,
    query,
    url: searchUrl.toString(),
  });

  const response = await fetchImpl(searchUrl.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
      // SearXNG bot detection requires these headers
      "X-Forwarded-For": "127.0.0.1",
      "X-Real-IP": "127.0.0.1",
    },
  });

  if (!response.ok) {
    const errorText = await response
      .text()
      .catch(() => "Could not read error response");
    console.error("[WebSearch] SearXNG request failed", {
      status: response.status,
      statusText: response.statusText,
      url: searchUrl.toString(),
      errorBody: errorText.substring(0, 500),
    });
    throw new Error(
      `SearXNG search failed with status ${response.status} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get("content-type");
  console.log("[WebSearch] SearXNG response headers", {
    contentType,
    status: response.status,
  });

  const responseText = await response.text();
  console.log("[WebSearch] SearXNG raw response (first 1000 chars)", {
    responsePreview: responseText.substring(0, 1000),
    fullLength: responseText.length,
  });

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    console.error("[WebSearch] Failed to parse SearXNG response as JSON", {
      error:
        parseError instanceof Error ? parseError.message : String(parseError),
      responsePreview: responseText.substring(0, 500),
    });
    throw new Error(
      `SearXNG returned invalid JSON. Make sure JSON format is enabled in settings.yml. Response preview: ${responseText.substring(0, 200)}`,
    );
  }

  const typedData = data as {
    results?: SearXNGResult[];
    error?: string;
    answers?: unknown[];
    infoboxes?: unknown[];
    suggestions?: unknown[];
    unresponsive_engines?: string[];
    number_of_results?: number;
  };

  console.log("[WebSearch] SearXNG parsed response structure", {
    hasResults: "results" in (data as Record<string, unknown>),
    hasError: "error" in (data as Record<string, unknown>),
    keys: Object.keys(data as Record<string, unknown>),
    resultsType: Array.isArray(typedData.results)
      ? "array"
      : typeof typedData.results,
    resultsLength: Array.isArray(typedData.results)
      ? typedData.results.length
      : "not-array",
    number_of_results: typedData.number_of_results,
    unresponsive_engines: typedData.unresponsive_engines,
    hasAnswers:
      Array.isArray(typedData.answers) && typedData.answers.length > 0,
    hasSuggestions:
      Array.isArray(typedData.suggestions) && typedData.suggestions.length > 0,
  });

  if (typedData.error) {
    console.error("[WebSearch] SearXNG returned an error", {
      error: typedData.error,
      query,
    });
    throw new Error(`SearXNG error: ${typedData.error}`);
  }

  if (
    typedData.unresponsive_engines &&
    typedData.unresponsive_engines.length > 0
  ) {
    console.warn("[WebSearch] SearXNG engines are unresponsive", {
      unresponsiveEngines: typedData.unresponsive_engines,
      query,
    });
  }

  if (!typedData.results) {
    console.warn("[WebSearch] SearXNG response has no results field", {
      availableKeys: Object.keys(typedData),
      responseSample: JSON.stringify(typedData).substring(0, 500),
    });
    return [];
  }

  // Check actual results array length, not number_of_results field
  // (number_of_results can be 0 even when results array has items)
  if (typedData.results && typedData.results.length === 0) {
    console.warn("[WebSearch] SearXNG returned zero results", {
      query,
      unresponsiveEngines: typedData.unresponsive_engines,
      hasSuggestions:
        Array.isArray(typedData.suggestions) &&
        typedData.suggestions.length > 0,
      suggestions: typedData.suggestions,
      number_of_results: typedData.number_of_results,
    });
  }

  console.log("[WebSearch] SearXNG results sample", {
    resultCount: typedData.results.length,
    firstResult: typedData.results[0]
      ? {
          hasUrl: "url" in typedData.results[0],
          hasTitle: "title" in typedData.results[0],
          hasContent: "content" in typedData.results[0],
          keys: Object.keys(typedData.results[0]),
        }
      : "no-results",
  });

  return typedData.results;
}

export function normalizeSearXNGResult(
  result: SearXNGResult | Record<string, unknown>,
): { url: string; title: string; snippet: string; engine?: string } | null {
  // SearXNG might use different field names, try multiple variations
  const title =
    (typeof result.title === "string" ? result.title : undefined)?.trim() ??
    (typeof (result as { title?: unknown }).title === "string"
      ? (result as { title: string }).title
      : undefined
    )?.trim() ??
    "";
  const snippet =
    (typeof result.content === "string" ? result.content : undefined)?.trim() ??
    (typeof (result as { content?: unknown }).content === "string"
      ? (result as { content: string }).content
      : undefined
    )?.trim() ??
    (typeof (result as { snippet?: unknown }).snippet === "string"
      ? (result as { snippet: string }).snippet
      : undefined
    )?.trim() ??
    "";
  const url =
    (typeof result.url === "string" ? result.url : undefined)?.trim() ??
    (typeof (result as { url?: unknown }).url === "string"
      ? (result as { url: string }).url
      : undefined
    )?.trim() ??
    "";
  const engine =
    (typeof result.engine === "string" ? result.engine : undefined) ??
    (typeof (result as { engine?: unknown }).engine === "string"
      ? (result as { engine: string }).engine
      : undefined);

  if (!url || !title) {
    console.warn("[WebSearch] Skipping result due to missing fields", {
      hasUrl: Boolean(url),
      hasTitle: Boolean(title),
      resultKeys: Object.keys(result),
      resultSample: JSON.stringify(result).substring(0, 200),
    });
    return null;
  }

  return {
    url,
    title,
    snippet,
    engine,
  };
}

function normalizeText(value: string): string {
  return value.toLowerCase();
}

export function resolveTargetDomain({
  query,
  requestedDomainId,
  config,
}: {
  query: string;
  requestedDomainId?: string;
  config: SearchConfig;
}): SearchDomain | null {
  if (requestedDomainId) {
    const requested = getSearchDomainById(requestedDomainId);
    if (requested && config.enabledDomainIds.has(requested.id)) {
      return requested;
    }
    console.warn("[WebSearch] Requested domain is not enabled", {
      requestedDomainId,
    });
    return null;
  }

  const normalizedQuery = normalizeText(query);

  for (const domain of config.enabledDomains) {
    const keywords = domain.keywords ?? [];
    const matchedKeyword = keywords.find((keyword) =>
      normalizedQuery.includes(normalizeText(keyword)),
    );

    if (matchedKeyword) {
      console.log("[WebSearch] Auto-selected domain from keyword match", {
        domain: domain.id,
        keyword: matchedKeyword,
      });
      return domain;
    }
  }

  // If no keyword match and no domains enabled, return null
  // Otherwise return the first enabled domain
  if (config.enabledDomains.length > 0) {
    return config.enabledDomains[0];
  }

  return null;
}

export function createWebSearchTool(options: WebSearchOptions) {
  const searchConfig = buildSearchConfig({
    selectedDomainIds: options.selectedDomainIds,
    environment: options.environment,
  });
  const fetchImpl = options.fetchImpl ?? fetch;

  // Check if endpoint is configured
  const endpoint = process.env.SEARXNG_ENDPOINT;
  if (endpoint) {
    console.log("[WebSearch] Tool created with endpoint:", endpoint);
  } else {
    console.warn(
      "[WebSearch] SEARXNG_ENDPOINT not configured - web search will fail",
    );
  }

  return tool({
    description:
      "Search the web across the enabled Oracle NetSuite help resources. Provide a query and optionally a specific domain id.",
    inputSchema: z.object({
      query: z
        .string()
        .min(1, "Provide a keyword or question to search for.")
        .describe("Search keywords or question."),
      domainId: z
        .string()
        .optional()
        .describe(
          "Optional search domain id. Use list_search_domains to discover available ids.",
        ),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Maximum number of results to return (default 5)."),
    }),
    execute: async (input) => {
      console.log("[WebSearch] Tool execute called", {
        input,
        hasEndpoint: Boolean(process.env.SEARXNG_ENDPOINT),
      });

      const { query, domainId, maxResults = 5 } = input;

      // Check if any domains are enabled
      if (searchConfig.enabledDomainIds.size === 0) {
        return {
          error:
            "Web search is not available. Please enable at least one domain in Settings > NetSuite > Web Resources.",
        };
      }

      const targetDomain = resolveTargetDomain({
        query,
        requestedDomainId: domainId,
        config: searchConfig,
      });

      if (!targetDomain) {
        return {
          error:
            "No enabled domain found for this search. Please enable at least one domain in Settings > NetSuite > Web Resources.",
        };
      }

      const enabledDomainIds = Array.from(searchConfig.enabledDomainIds);

      console.log("[WebSearch] Starting search", {
        query,
        domainId,
        targetDomain: targetDomain.id,
        enabledDomainIds,
        environment: options.environment,
      });

      const status = getSearchDomainStatus(targetDomain, searchConfig);

      if (status === "coming-soon") {
        return {
          error: `${targetDomain.label} is marked as coming soon and cannot be searched yet.`,
        };
      }

      if (status === "locked") {
        return {
          error: `${targetDomain.label} is locked. Ask the user to enable the appropriate add-on before searching it.`,
        };
      }

      if (!searchConfig.enabledDomainIds.has(targetDomain.id)) {
        return {
          error: `${targetDomain.label} is not enabled. Call list_search_domains to discover available options.`,
        };
      }

      const siteFilters: string[] = [buildSiteFilter(targetDomain)];
      if (targetDomain.path) {
        const hostOnlyFilter = `site:${targetDomain.hostname}`;
        if (hostOnlyFilter !== siteFilters[0]) {
          siteFilters.push(hostOnlyFilter);
        }
      }

      let lastPayload:
        | {
            provider: string;
            domain: { id: string; label: string; url: string };
            query: string;
            results: { url: string; title: string; snippet: string }[];
            fetchedAt: string;
          }
        | undefined;

      for (const siteFilter of siteFilters) {
        const combinedQuery = `${siteFilter} ${query}`.trim();

        console.log("[WebSearch] Attempting search", {
          siteFilter,
          combinedQuery,
          target: targetDomain.id,
        });

        try {
          const searchResults = await searchSearXNG(combinedQuery, fetchImpl);

          console.log("[WebSearch] SearXNG results", {
            resultCount: searchResults.length,
            siteFilter,
            combinedQuery,
          });

          const normalized = searchResults
            .map((result) => normalizeSearXNGResult(result))
            .filter(
              (
                result,
              ): result is {
                url: string;
                title: string;
                snippet: string;
                engine?: string;
              } => Boolean(result),
            )
            .slice(0, maxResults);

          const topUrls = normalized.slice(0, 3).map((result) => result.url);

          console.log("[WebSearch] Normalized results", {
            count: normalized.length,
            target: targetDomain.id,
            siteFilter,
            combinedQuery,
            topUrls,
          });

          const payload: WebSearchToolResult = {
            provider: "searxng",
            domain: {
              id: targetDomain.id,
              label: targetDomain.label,
              url: getSearchDomainUrl(targetDomain),
            },
            query: combinedQuery,
            results: normalized,
            fetchedAt: new Date().toISOString(),
            metadata: {
              siteFilter,
            },
          };

          if (normalized.length > 0) {
            return payload;
          }

          lastPayload = payload;
          console.log("[WebSearch] No results for filter, checking fallback", {
            siteFilter,
            target: targetDomain.id,
            combinedQuery,
          });
        } catch (error) {
          console.error("[WebSearch] Error completing search", {
            message: error instanceof Error ? error.message : String(error),
            query: combinedQuery,
            siteFilter,
            target: targetDomain.id,
          });
          return {
            error: `Failed to complete the web search: ${error instanceof Error ? error.message : "Unknown error"}`,
          };
        }
      }

      return (
        lastPayload ??
        ({
          provider: "searxng",
          domain: {
            id: targetDomain.id,
            label: targetDomain.label,
            url: getSearchDomainUrl(targetDomain),
          },
          query,
          results: [],
          fetchedAt: new Date().toISOString(),
          metadata: {
            siteFilter: siteFilters.at(-1) ?? buildSiteFilter(targetDomain),
          },
        } satisfies WebSearchToolResult)
      );
    },
  });
}
