import { randomUUID } from "node:crypto";
import { tool } from "ai";
import { z } from "zod";
import { getUserSettings } from "@/lib/db/queries";
import { getNetSuiteToken } from "./tokens";

async function getMCPBaseUrl(userId: string): Promise<string | null> {
  const settings = await getUserSettings({ userId });
  const NS_ACCOUNT_ID = settings?.netsuiteAccountId;
  if (!NS_ACCOUNT_ID) {
    return null;
  }
  return `https://${NS_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/mcp/v1`;
}

/**
 * JSON-RPC 2.0 Request type
 */
type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
};

/**
 * JSON-RPC 2.0 Response type
 */
type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

/**
 * MCP Tool definition from NetSuite
 */
export type MCPTool = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

/**
 * Fetch all available MCP tools from NetSuite
 */
export async function fetchMCPTools(
  userId: string,
  accessToken: string,
): Promise<MCPTool[]> {
  const baseUrl = await getMCPBaseUrl(userId);
  if (!baseUrl) {
    throw new Error(
      "NetSuite Account ID is not configured. Please set it in Settings.",
    );
  }

  const url = `${baseUrl}/all`;
  console.log(`[NetSuite] Fetching tools from: ${url}`);

  const requestId = randomUUID();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: requestId,
      method: "tools/list",
      params: {},
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[NetSuite] HTTP ${response.status} error:`, errorText);
    throw new Error(
      `Failed to fetch MCP tools: ${response.status} ${errorText}`,
    );
  }

  const jsonRpcResponse = (await response.json()) as JsonRpcResponse;

  if (jsonRpcResponse.error) {
    throw new Error(
      `MCP tools/list error: ${jsonRpcResponse.error.message} (code: ${jsonRpcResponse.error.code})`,
    );
  }

  // The result should be an object with a tools array
  let tools: MCPTool[] = [];

  if (jsonRpcResponse.result && typeof jsonRpcResponse.result === "object") {
    const resultObj = jsonRpcResponse.result as Record<string, unknown>;
    if (Array.isArray(resultObj.tools)) {
      tools = resultObj.tools as MCPTool[];
    } else if (Array.isArray(jsonRpcResponse.result)) {
      // Fallback: result might be an array directly
      tools = jsonRpcResponse.result as MCPTool[];
    } else {
      console.warn("[NetSuite] Unexpected result structure:", resultObj);
      tools = [];
    }
  }

  console.log(`[NetSuite] Successfully fetched ${tools.length} tools`);
  return tools;
}

/**
 * Execute an MCP tool call
 */
export async function executeMCPTool(params: {
  userId: string;
  accessToken: string;
  toolName: string;
  toolParams: unknown;
}): Promise<unknown> {
  const baseUrl = await getMCPBaseUrl(params.userId);
  if (!baseUrl) {
    throw new Error(
      "NetSuite Account ID is not configured. Please set it in Settings.",
    );
  }

  const url = `${baseUrl}/all`;
  const requestId = randomUUID();

  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: requestId,
    method: "tools/call",
    params: {
      name: params.toolName,
      arguments: params.toolParams,
    },
  };

  console.log(
    `[NetSuite] Calling tool: ${params.toolName} with params:`,
    params.toolParams,
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000); // 30 second timeout

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[NetSuite] Tool ${params.toolName} HTTP error:`,
        response.status,
        errorText,
      );
      throw new Error(
        `MCP tool execution failed: ${response.status} ${errorText}`,
      );
    }

    const result = (await response.json()) as JsonRpcResponse;

    console.log(`[NetSuite] Tool ${params.toolName} response received`);

    if (result.error) {
      console.error(
        `[NetSuite] Tool ${params.toolName} JSON-RPC error:`,
        result.error,
      );
      throw new Error(
        `MCP tool error: ${result.error.message} (code: ${result.error.code})`,
      );
    }

    console.log(
      `[NetSuite] Tool ${params.toolName} succeeded, result type:`,
      typeof result.result,
    );
    return result.result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("MCP tool execution timed out after 30 seconds");
    }
    throw error;
  }
}

/**
 * Convert MCP tool schema to Zod schema
 */
function mcpSchemaToZod(
  mcpSchema: MCPTool["inputSchema"],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, value] of Object.entries(mcpSchema.properties)) {
    const prop = value as {
      type: string;
      description?: string;
      [propKey: string]: unknown;
    };

    let zodType: z.ZodTypeAny;

    switch (prop.type) {
      case "string":
        zodType = z.string();
        break;
      case "number":
        zodType = z.number();
        break;
      case "integer":
        zodType = z.number().int();
        break;
      case "boolean":
        zodType = z.boolean();
        break;
      case "array":
        zodType = z.array(z.unknown());
        break;
      case "object":
        zodType = z.record(z.unknown());
        break;
      default:
        zodType = z.unknown();
    }

    if (prop.description) {
      zodType = zodType.describe(prop.description);
    }

    shape[key] = zodType;
  }

  return z.object(shape);
}

/**
 * Create a dynamic tool from an MCP tool definition
 */
export function createMCPTool(params: { mcpTool: MCPTool; userId: string }) {
  const zodSchema = mcpSchemaToZod(params.mcpTool.inputSchema);

  return tool({
    description: params.mcpTool.description,
    inputSchema: zodSchema,
    execute: async (input: z.infer<typeof zodSchema>) => {
      const accessToken = await getNetSuiteToken(params.userId);

      if (!accessToken) {
        return {
          error:
            "NetSuite authentication required. Please connect your NetSuite account first.",
        };
      }

      try {
        console.log(`[NetSuite] Executing tool ${params.mcpTool.name}...`);
        const result = await executeMCPTool({
          userId: params.userId,
          accessToken,
          toolName: params.mcpTool.name,
          toolParams: input,
        });

        console.log(
          `[NetSuite] Tool ${params.mcpTool.name} completed successfully`,
        );
        return {
          success: true,
          result,
        };
      } catch (error) {
        console.error(`[NetSuite] Tool ${params.mcpTool.name} failed:`, error);
        return {
          error:
            error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    },
  });
}

/**
 * Load and create all NetSuite MCP tools for a user
 */
export async function loadNetSuiteMCPTools(
  userId: string,
): Promise<Record<string, unknown>> {
  const accessToken = await getNetSuiteToken(userId);

  if (!accessToken) {
    console.log("[NetSuite] No access token found for user:", userId);
    return {};
  }

  try {
    console.log("[NetSuite] Fetching MCP tools from NetSuite...");
    const mcpTools = await fetchMCPTools(userId, accessToken);

    if (!Array.isArray(mcpTools)) {
      console.error(
        "[NetSuite] Tools response is not an array:",
        typeof mcpTools,
        mcpTools,
      );
      return {};
    }

    console.log(`[NetSuite] Received ${mcpTools.length} tools from NetSuite`);

    // Dynamic tools from NetSuite MCP have varying schemas
    const tools: Record<string, unknown> = {};

    for (const mcpTool of mcpTools) {
      // Sanitize tool name for use as a key (remove special characters)
      const toolKey = mcpTool.name.replace(/[^a-zA-Z0-9_]/g, "_");
      console.log(`[NetSuite] Creating tool: ${mcpTool.name} -> ${toolKey}`);
      tools[toolKey] = createMCPTool({ mcpTool, userId });
    }

    return tools;
  } catch (error) {
    // If fetching tools fails, return empty object (user might need to re-authenticate)
    console.error("[NetSuite] Error fetching/creating tools:", error);
    return {};
  }
}
