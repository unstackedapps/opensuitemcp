import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { fetchMCPTools } from "@/lib/netsuite/mcp";
import { getNetSuiteToken } from "@/lib/netsuite/tokens";
import type { EnhancedToolMetadata } from "@/lib/netsuite/tool-metadata";
import { enhanceMCPToolsWithAI } from "@/lib/netsuite/tool-metadata";

// Simple in-memory cache for enhanced tool metadata (keyed by userId)
// In production, consider using Redis or a proper cache
const enhancedToolsCache = new Map<
  string,
  { tools: EnhancedToolMetadata[]; timestamp: number }
>();

const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

/**
 * GET /api/netsuite/mcp-tools
 * Returns list of available MCP tools with AI-enhanced metadata
 * Uses session-based caching to avoid re-enhancing on every request
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = await getNetSuiteToken(session.user.id);

  if (!accessToken) {
    return NextResponse.json(
      {
        error: "NetSuite not connected",
        message:
          "Please connect your NetSuite account in Settings to access MCP tools.",
      },
      { status: 400 },
    );
  }

  try {
    // Check cache first
    const cached = enhancedToolsCache.get(session.user.id);
    const now = Date.now();
    if (
      cached &&
      cached.tools.length > 0 &&
      now - cached.timestamp < CACHE_TTL
    ) {
      console.log(
        `[MCP Tools API] Returning ${cached.tools.length} cached enhanced tools`,
      );
      return NextResponse.json({ tools: cached.tools });
    }

    // Fetch raw tools from NetSuite
    const rawTools = await fetchMCPTools(session.user.id, accessToken);

    if (rawTools.length === 0) {
      return NextResponse.json({ tools: [] });
    }

    // Enhance with AI-generated metadata
    console.log(
      `[MCP Tools API] Enhancing ${rawTools.length} tools with AI metadata...`,
    );
    const enhancedTools = await enhanceMCPToolsWithAI(
      rawTools,
      session.user.id,
    );

    // Cache the enhanced tools
    enhancedToolsCache.set(session.user.id, {
      tools: enhancedTools,
      timestamp: now,
    });

    // Clean up old cache entries (older than 1 hour)
    for (const [userId, entry] of enhancedToolsCache.entries()) {
      if (now - entry.timestamp > CACHE_TTL * 2) {
        enhancedToolsCache.delete(userId);
      }
    }

    console.log(
      `[MCP Tools API] Returning ${enhancedTools.length} enhanced tools`,
    );

    return NextResponse.json({ tools: enhancedTools });
  } catch (error) {
    console.error("[MCP Tools API] Error fetching/enhancing tools:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch MCP tools",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    );
  }
}
