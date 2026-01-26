import { generateText } from "ai";
import { getUserProvider } from "@/lib/ai/providers";
import { getUserSettings } from "@/lib/db/queries";
import { decrypt } from "@/lib/encryption";
import type { MCPTool } from "./mcp";

// Regex patterns for markdown code block removal (defined at top level for performance)
const MARKDOWN_JSON_BLOCK_REGEX = /^```json\n?/;
const MARKDOWN_BLOCK_END_REGEX = /\n?```$/;
const MARKDOWN_BLOCK_START_REGEX = /^```\n?/;

export type EnhancedToolMetadata = {
  originalName: string;
  displayName: string;
  description: string;
  inputSchema: MCPTool["inputSchema"];
};

/**
 * Enhance a single MCP tool with AI-generated display name and description
 */
async function enhanceSingleTool(
  tool: MCPTool,
  userApiKey: string,
): Promise<EnhancedToolMetadata> {
  const provider = getUserProvider(userApiKey);

  const prompt = `You are helping to create user-friendly metadata for a NetSuite MCP tool.

Tool Information:
- Original Name: ${tool.name}
- Current Description: ${tool.description || "No description provided"}
- Input Schema: ${JSON.stringify(tool.inputSchema, null, 2)}

Generate:
1. A concise, user-friendly display name (2-4 words, title case)
   - Examples: "Create Record", "Get Customer Data", "Search Transactions"
   - Remove technical prefixes like "ns_", "get_", etc.
   - Make it action-oriented and clear

2. A brief, user-friendly description (1-2 sentences, max 120 characters)
   - Explain what the tool does in plain language
   - Focus on the business value, not technical details
   - Make it suitable for non-technical users building workflows

Return your response as JSON with this exact structure:
{
  "displayName": "User-friendly display name",
  "description": "Brief description of what this tool does"
}`;

  try {
    const result = await generateText({
      model: provider.languageModel("chat-model"),
      prompt,
      system:
        "You are a technical writer specializing in making complex tools accessible to business users. Generate clear, concise metadata.",
    });

    // Parse the JSON response
    let jsonText = result.text.trim();
    // Remove markdown code blocks if present
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText
        .replace(MARKDOWN_JSON_BLOCK_REGEX, "")
        .replace(MARKDOWN_BLOCK_END_REGEX, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText
        .replace(MARKDOWN_BLOCK_START_REGEX, "")
        .replace(MARKDOWN_BLOCK_END_REGEX, "");
    }

    const parsed = JSON.parse(jsonText) as {
      displayName: string;
      description: string;
    };

    if (!parsed.displayName) {
      throw new Error(`AI did not return a displayName for tool ${tool.name}`);
    }

    return {
      originalName: tool.name,
      displayName: parsed.displayName,
      description:
        parsed.description || tool.description || "No description available",
      inputSchema: tool.inputSchema,
    };
  } catch (error) {
    console.error(`[Tool Metadata] Error enhancing tool ${tool.name}:`, error);
    throw new Error(
      `Failed to enhance tool ${tool.name}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Enhance multiple MCP tools with AI-generated metadata
 * Processes tools in batches to avoid rate limits
 */
export async function enhanceMCPToolsWithAI(
  tools: MCPTool[],
  userId: string,
): Promise<EnhancedToolMetadata[]> {
  // Get user's API key
  const settings = await getUserSettings({ userId });
  if (!settings?.googleApiKey) {
    throw new Error(
      "Google API key is required for tool enhancement. Please set it in Settings.",
    );
  }

  let userApiKey: string;
  try {
    userApiKey = decrypt(settings.googleApiKey);
  } catch (error) {
    throw new Error(
      `Failed to decrypt API key: ${
        error instanceof Error ? error.message : "Unknown error"
      }. Please update your API key in Settings.`,
    );
  }

  // Process tools in batches of 5 to avoid rate limits
  const batchSize = 5;
  const enhanced: EnhancedToolMetadata[] = [];

  for (let i = 0; i < tools.length; i += batchSize) {
    const batch = tools.slice(i, i + batchSize);
    console.log(
      `[Tool Metadata] Enhancing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tools.length / batchSize)}`,
    );

    const batchResults = await Promise.all(
      batch.map((tool) => enhanceSingleTool(tool, userApiKey)),
    );
    enhanced.push(...batchResults);
  }

  return enhanced;
}
