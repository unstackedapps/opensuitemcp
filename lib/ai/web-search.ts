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

const TRAILING_SLASH_REGEX = /\/+$/;

function getSearXNGEndpoint(): string {
  const endpoint = process.env.SEARXNG_ENDPOINT;
  if (!endpoint) {
    throw new Error(
      "SEARXNG_ENDPOINT environment variable is required. Use .env.local.",
    );
  }
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
      `SearXNG returned invalid JSON. Enable JSON format in settings.yml. Response preview: ${responseText.substring(0, 200)}`,
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

export type ExecuteDomainSearchParams = {
  siteFilter: string;
  domainId: string;
  domainLabel: string;
  domainUrl: string;
  query: string;
  maxResults: number;
  fetchImpl: typeof fetch;
};

/** Run a SearXNG search restricted to a single site. Used by domain-specific tools in lib/ai/tools/. */
export async function executeSearXNGDomainSearch(
  params: ExecuteDomainSearchParams,
): Promise<WebSearchToolResult> {
  const {
    siteFilter,
    domainId,
    domainLabel,
    domainUrl,
    query,
    maxResults,
    fetchImpl,
  } = params;
  const combinedQuery = `${siteFilter} ${query}`.trim();

  const searchResults = await searchSearXNG(combinedQuery, fetchImpl);
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

  return {
    provider: "searxng",
    domain: { id: domainId, label: domainLabel, url: domainUrl },
    query: combinedQuery,
    results: normalized,
    fetchedAt: new Date().toISOString(),
    metadata: { siteFilter },
  };
}
