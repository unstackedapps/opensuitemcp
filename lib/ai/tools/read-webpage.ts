import { tool } from "ai";
import { load as loadHtml } from "cheerio";
import { z } from "zod";

type ReadWebpageOptions = {
  fetchImpl?: typeof fetch;
};

export type ReadWebpageToolResult = {
  url: string;
  title: string;
  content: string;
  fetchedAt: string;
  error?: string;
};

function extractTextContent(
  html: string,
  url: string,
): {
  title: string;
  content: string;
} {
  const $ = loadHtml(html);

  // Extract title
  const title =
    $("title").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    url;

  // Remove unwanted elements
  $(
    "script, style, nav, header, footer, aside, .ad, .advertisement, .sidebar",
  ).remove();

  // Try to find main content area
  const mainContent = $(
    "main, article, [role='main'], .content, .main-content, #content",
  ).first();

  const contentElement = mainContent.length > 0 ? mainContent : $("body");

  // Extract text, preserving some structure
  let text = contentElement
    .find("p, h1, h2, h3, h4, h5, h6, li, td, th")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((item) => item.length > 0)
    .join("\n\n");

  // Fallback: if we didn't get much content, try getting all text
  if (text.length < 200) {
    text = contentElement.text().trim();
  }

  // Clean up excessive whitespace
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  return { title, content: text };
}

export function createReadWebpageTool(options: ReadWebpageOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;

  return tool({
    description:
      "Fetch and read the full text content from a webpage URL. Use this to get detailed information from a specific page after finding it via web search.",
    inputSchema: z.object({
      url: z
        .string()
        .url("Must be a valid URL")
        .describe("The webpage URL to read"),
    }),
    execute: async (input) => {
      const { url } = input;

      console.log("[ReadWebpage] Fetching webpage", { url });

      try {
        const response = await fetchImpl(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          },
          // Timeout after 10 seconds
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
          console.error("[ReadWebpage] Request failed", {
            url,
            status: response.status,
            statusText: response.statusText,
          });
          return {
            url,
            title: url,
            content: "",
            fetchedAt: new Date().toISOString(),
            error: `Failed to fetch webpage: ${response.status} ${response.statusText}`,
          };
        }

        const contentType = response.headers.get("content-type");
        if (!contentType?.includes("text/html")) {
          console.warn("[ReadWebpage] Non-HTML content type", {
            url,
            contentType,
          });
          return {
            url,
            title: url,
            content: "",
            fetchedAt: new Date().toISOString(),
            error: `URL does not return HTML content (content-type: ${contentType})`,
          };
        }

        const html = await response.text();
        const { title, content } = extractTextContent(html, url);

        console.log("[ReadWebpage] Successfully extracted content", {
          url,
          title,
          contentLength: content.length,
        });

        return {
          url,
          title,
          content,
          fetchedAt: new Date().toISOString(),
        };
      } catch (error) {
        console.error("[ReadWebpage] Error fetching webpage", {
          url,
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          url,
          title: url,
          content: "",
          fetchedAt: new Date().toISOString(),
          error:
            error instanceof Error
              ? error.message
              : "Unknown error fetching webpage",
        };
      }
    },
  });
}
