import { randomUUID } from "node:crypto";
import { tool } from "ai";
import { z } from "zod";
import { getUserSettings } from "@/lib/db/queries";
import { getNetSuiteApiHost, normalizeNetSuiteAccountId } from "./accounts";
import {
  assertMcpToolCallAllowed,
  isMcpToolAllowed,
} from "./mcp-tool-settings";
import {
  createMcpToolsListCache,
  MCP_TOOLS_LIST_TTL_MS,
} from "./mcp-tools-cache";
import {
  deleteDurableMcpTools,
  readDurableMcpTools,
  writeDurableMcpTools,
} from "./mcp-tools-durable";
import { getNetSuiteToken } from "./tokens";

async function getMCPBaseUrl(
  userId: string,
  accountId?: string | null,
): Promise<string | null> {
  if (accountId?.trim()) {
    return `${getNetSuiteApiHost(accountId)}/services/mcp/v1`;
  }
  const settings = await getUserSettings({ userId });
  const NS_ACCOUNT_ID = settings?.netsuiteAccountId;
  if (!NS_ACCOUNT_ID) {
    return null;
  }
  return `${getNetSuiteApiHost(NS_ACCOUNT_ID)}/services/mcp/v1`;
}

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
};

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

export type MCPToolUiMeta = {
  resourceUri?: string;
  /** Deprecated flat key still used by some servers */
  "ui/resourceUri"?: string;
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
  _meta?: {
    ui?: MCPToolUiMeta;
    [key: string]: unknown;
  };
  annotations?: {
    title?: string;
    [key: string]: unknown;
  };
};

const mcpToolsListCache = createMcpToolsListCache<MCPTool[]>(
  MCP_TOOLS_LIST_TTL_MS,
);
const backgroundRefreshKeys = new Set<string>();

export type MCPResourceContents = {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
  _meta?: Record<string, unknown>;
};

export function getToolUiResourceUri(mcpTool: MCPTool): string | undefined {
  const nested = mcpTool._meta?.ui?.resourceUri;
  if (typeof nested === "string" && nested.startsWith("ui://")) {
    return nested;
  }
  const flat = mcpTool._meta?.["ui/resourceUri"];
  if (typeof flat === "string" && flat.startsWith("ui://")) {
    return flat;
  }
  const deprecated = mcpTool._meta?.ui?.["ui/resourceUri"];
  if (typeof deprecated === "string" && deprecated.startsWith("ui://")) {
    return deprecated;
  }
  return undefined;
}

async function mcpJsonRpc(params: {
  userId: string;
  accessToken: string;
  method: string;
  rpcParams?: unknown;
  timeoutMs?: number;
  accountId?: string | null;
}): Promise<unknown> {
  const baseUrl = await getMCPBaseUrl(params.userId, params.accountId);
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
    method: params.method,
    params: params.rpcParams ?? {},
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    params.timeoutMs ?? 30_000,
  );

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
      throw new Error(
        `MCP ${params.method} failed: ${response.status} ${errorText}`,
      );
    }

    const result = (await response.json()) as JsonRpcResponse;
    if (result.error) {
      throw new Error(
        `MCP ${params.method} error: ${result.error.message} (code: ${result.error.code})`,
      );
    }

    return result.result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`MCP ${params.method} timed out`);
    }
    throw error;
  }
}

export function invalidateMcpToolsListCache(
  userId: string,
  accountId?: string | null,
) {
  mcpToolsListCache.invalidate(userId, accountId);
  deleteDurableMcpTools(userId, accountId).catch(() => {
    // Best-effort cleanup
  });
}

function rememberMcpToolsCatalog(
  userId: string,
  accountId: string,
  tools: MCPTool[],
  fetchedAt: number = Date.now(),
) {
  if (tools.length === 0) {
    return;
  }
  mcpToolsListCache.set(userId, accountId, tools, fetchedAt);
  writeDurableMcpTools(userId, accountId, tools, fetchedAt).catch(() => {
    // Logged inside writer
  });
}

async function refreshMcpToolsInBackground(userId: string, accountId: string) {
  const key = `${userId}:${accountId}`;
  if (backgroundRefreshKeys.has(key)) {
    return;
  }
  backgroundRefreshKeys.add(key);
  try {
    const accessToken = await getNetSuiteToken(userId, accountId);
    if (!accessToken) {
      return;
    }
    const tools = await fetchMCPToolsFromNetSuite(
      userId,
      accessToken,
      accountId,
    );
    if (tools.length > 0) {
      rememberMcpToolsCatalog(userId, accountId, tools);
      console.log(
        `[NetSuite] Background refreshed tools/list (${tools.length} tools)`,
      );
    }
  } catch (error) {
    console.warn(
      "[NetSuite] Background tools/list refresh failed:",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    backgroundRefreshKeys.delete(key);
  }
}

function scheduleMcpToolsRefresh(userId: string, accountId: string) {
  refreshMcpToolsInBackground(userId, accountId).catch(() => {
    // Logged inside refresh
  });
}

async function fetchMCPToolsFromNetSuite(
  userId: string,
  accessToken: string,
  accountId?: string | null,
): Promise<MCPTool[]> {
  console.log("[NetSuite] Fetching tools via tools/list");
  const result = await mcpJsonRpc({
    userId,
    accessToken,
    method: "tools/list",
    rpcParams: {},
    accountId,
  });

  let tools: MCPTool[] = [];
  if (result && typeof result === "object") {
    const resultObj = result as Record<string, unknown>;
    if (Array.isArray(resultObj.tools)) {
      tools = resultObj.tools as MCPTool[];
    } else if (Array.isArray(result)) {
      tools = result as MCPTool[];
    }
  }

  const withUi = tools.filter((toolDef) => getToolUiResourceUri(toolDef));
  console.log(
    `[NetSuite] Successfully fetched ${tools.length} tools (${withUi.length} MCP Apps)`,
  );
  for (const toolDef of tools) {
    if (toolDef.name.includes("_app") || getToolUiResourceUri(toolDef)) {
      console.log(
        `[NetSuite] App-like tool ${toolDef.name}:`,
        JSON.stringify({
          _meta: toolDef._meta ?? null,
          annotations: toolDef.annotations ?? null,
          resourceUri: getToolUiResourceUri(toolDef) ?? null,
        }),
      );
    }
  }

  return tools;
}

/**
 * Fetch all available MCP tools from NetSuite.
 * Fresh (30m) and stale (7d) memory entries avoid blocking chat; durable
 * `.data/mcp-tools` survives restarts. In-flight calls coalesce.
 */
export async function fetchMCPTools(
  userId: string,
  accessToken: string,
  accountId?: string | null,
  options?: { forceRefresh?: boolean },
): Promise<MCPTool[]> {
  const normalizedAccountId = accountId?.trim()
    ? normalizeNetSuiteAccountId(accountId)
    : null;
  const load = async () => {
    const tools = await fetchMCPToolsFromNetSuite(
      userId,
      accessToken,
      normalizedAccountId,
    );
    if (normalizedAccountId && tools.length > 0) {
      rememberMcpToolsCatalog(userId, normalizedAccountId, tools);
    }
    return tools;
  };

  if (!normalizedAccountId) {
    return load();
  }

  if (options?.forceRefresh) {
    const tools = await load();
    if (tools.length === 0) {
      mcpToolsListCache.invalidate(userId, normalizedAccountId);
      await deleteDurableMcpTools(userId, normalizedAccountId);
    }
    return tools;
  }

  const memory = mcpToolsListCache.getLookup(userId, normalizedAccountId);
  if (memory) {
    if (memory.fresh) {
      console.log(
        `[NetSuite] Using cached tools/list (${memory.value.length} tools)`,
      );
    } else {
      console.log(
        `[NetSuite] Using stale tools/list (${memory.value.length} tools); refreshing in background`,
      );
      scheduleMcpToolsRefresh(userId, normalizedAccountId);
    }
    return memory.value;
  }

  const durable = await readDurableMcpTools(userId, normalizedAccountId);
  if (durable) {
    mcpToolsListCache.set(
      userId,
      normalizedAccountId,
      durable.tools,
      durable.fetchedAt,
    );
    const ageMs = Date.now() - durable.fetchedAt;
    if (ageMs < MCP_TOOLS_LIST_TTL_MS) {
      console.log(
        `[NetSuite] Using durable tools/list (${durable.tools.length} tools)`,
      );
    } else {
      console.log(
        `[NetSuite] Using durable stale tools/list (${durable.tools.length} tools); refreshing in background`,
      );
      scheduleMcpToolsRefresh(userId, normalizedAccountId);
    }
    return durable.tools;
  }

  return mcpToolsListCache.getOrFetch(
    userId,
    normalizedAccountId,
    load,
    (tools) => tools.length > 0,
  );
}

/**
 * Execute an MCP tool call
 */
export async function executeMCPTool(params: {
  userId: string;
  accessToken: string;
  toolName: string;
  toolParams: unknown;
  accountId?: string | null;
}): Promise<unknown> {
  const settings = await getUserSettings({ userId: params.userId });
  const rawAccountId =
    params.accountId?.trim() || settings?.netsuiteAccountId?.trim() || "";
  const accountId = rawAccountId
    ? normalizeNetSuiteAccountId(rawAccountId)
    : null;
  assertMcpToolCallAllowed(
    settings?.netsuiteMcpTools,
    accountId,
    params.toolName,
  );

  console.log(
    `[NetSuite] Calling tool: ${params.toolName} with params:`,
    params.toolParams,
  );

  const result = await mcpJsonRpc({
    userId: params.userId,
    accessToken: params.accessToken,
    method: "tools/call",
    rpcParams: {
      name: params.toolName,
      arguments: params.toolParams,
    },
    accountId,
  });

  console.log(
    `[NetSuite] Tool ${params.toolName} succeeded, result type:`,
    typeof result,
  );
  return result;
}

/**
 * Read an MCP resource (used for MCP App HTML UIs)
 */
export async function readMCPResource(params: {
  userId: string;
  accessToken: string;
  uri: string;
  accountId?: string | null;
}): Promise<{ contents: MCPResourceContents[] }> {
  console.log(`[NetSuite] Reading resource: ${params.uri}`);
  const result = await mcpJsonRpc({
    userId: params.userId,
    accessToken: params.accessToken,
    method: "resources/read",
    rpcParams: { uri: params.uri },
    timeoutMs: 45_000,
    accountId: params.accountId,
  });

  if (!result || typeof result !== "object") {
    throw new Error("Invalid resources/read response");
  }

  const contents = (result as { contents?: MCPResourceContents[] }).contents;
  if (!Array.isArray(contents) || contents.length === 0) {
    throw new Error(`No contents returned for resource ${params.uri}`);
  }

  return { contents };
}

/**
 * Convert MCP tool schema to Zod schema
 */
function mcpSchemaToZod(
  mcpSchema: MCPTool["inputSchema"],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const properties = mcpSchema?.properties ?? {};

  for (const [key, value] of Object.entries(properties)) {
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

    // NetSuite app tools often accept empty/optional args
    const required = mcpSchema.required ?? [];
    shape[key] = required.includes(key) ? zodType : zodType.optional();
  }

  return z.object(shape).passthrough();
}

/**
 * Create a dynamic tool from an MCP tool definition
 */
export function createMCPTool(params: {
  mcpTool: MCPTool;
  userId: string;
  accountId: string | null;
}) {
  const zodSchema = mcpSchemaToZod(params.mcpTool.inputSchema);
  const uiResourceUri = getToolUiResourceUri(params.mcpTool);

  return tool({
    description: params.mcpTool.description,
    inputSchema: zodSchema,
    execute: async (input: z.infer<typeof zodSchema>) => {
      const accessToken = await getNetSuiteToken(
        params.userId,
        params.accountId,
      );

      if (!accessToken) {
        return {
          error:
            "NetSuite authentication required. Connect a NetSuite MCP connection in Settings first.",
        };
      }

      try {
        console.log(`[NetSuite] Executing tool ${params.mcpTool.name}...`);
        const result = await executeMCPTool({
          userId: params.userId,
          accessToken,
          toolName: params.mcpTool.name,
          toolParams: input,
          accountId: params.accountId,
        });

        console.log(
          `[NetSuite] Tool ${params.mcpTool.name} completed successfully`,
        );
        return {
          success: true,
          result,
          ...(uiResourceUri
            ? {
                ui: {
                  resourceUri: uiResourceUri,
                  toolName: params.mcpTool.name,
                  title:
                    params.mcpTool.annotations?.title ?? params.mcpTool.name,
                  input,
                },
              }
            : {}),
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

export type LoadedNetSuiteMcpTools = {
  tools: Record<string, unknown>;
  activeToolKeys: string[];
};

const EMPTY_LOADED_MCP_TOOLS: LoadedNetSuiteMcpTools = {
  tools: {},
  activeToolKeys: [],
};

function materializeNetSuiteMcpTools(params: {
  mcpTools: MCPTool[];
  userId: string;
  accountId: string | null;
  netsuiteMcpTools: Parameters<typeof isMcpToolAllowed>[0];
}): LoadedNetSuiteMcpTools {
  const tools: Record<string, unknown> = {};
  const activeToolKeys: string[] = [];

  for (const mcpTool of params.mcpTools) {
    const toolKey = mcpTool.name.replace(/[^a-zA-Z0-9_]/g, "_");
    tools[toolKey] = createMCPTool({
      mcpTool,
      userId: params.userId,
      accountId: params.accountId,
    });
    if (
      isMcpToolAllowed(params.netsuiteMcpTools, params.accountId, mcpTool.name)
    ) {
      activeToolKeys.push(toolKey);
    }
  }

  return { tools, activeToolKeys };
}

/**
 * Load and create all NetSuite MCP tools for a user.
 * Prefers memory/durable catalogs so chat is not blocked on tools/list.
 * Disabled tools stay registered so invoke returns a clear error instead of 404.
 */
export async function loadNetSuiteMCPTools(
  userId: string,
  options?: {
    settings?: Awaited<ReturnType<typeof getUserSettings>>;
    orgId?: string | null;
  },
): Promise<LoadedNetSuiteMcpTools> {
  const settings =
    options && "settings" in options
      ? options.settings
      : await getUserSettings({ userId });
  const accountId = settings?.netsuiteAccountId
    ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
    : null;

  if (!accountId) {
    console.log("[NetSuite] No account configured for user:", userId);
    return EMPTY_LOADED_MCP_TOOLS;
  }

  const { resolveEffectiveNetsuiteMcpToolSettings } = await import(
    "@/lib/org/mcp-tool-policy"
  );
  const effectiveMcpToolSettings =
    await resolveEffectiveNetsuiteMcpToolSettings({
      orgId: options?.orgId,
      accountId,
      userSettings: settings?.netsuiteMcpTools,
    });

  try {
    const memory = mcpToolsListCache.getLookup(userId, accountId);
    if (memory) {
      if (memory.fresh) {
        console.log(
          `[NetSuite] Using cached tools/list (${memory.value.length} tools)`,
        );
      } else {
        console.log(
          `[NetSuite] Using stale tools/list (${memory.value.length} tools); refreshing in background`,
        );
        scheduleMcpToolsRefresh(userId, accountId);
      }
      return materializeNetSuiteMcpTools({
        mcpTools: memory.value,
        userId,
        accountId,
        netsuiteMcpTools: effectiveMcpToolSettings,
      });
    }

    const durable = await readDurableMcpTools(userId, accountId);
    if (durable) {
      mcpToolsListCache.set(
        userId,
        accountId,
        durable.tools,
        durable.fetchedAt,
      );
      const ageMs = Date.now() - durable.fetchedAt;
      if (ageMs < MCP_TOOLS_LIST_TTL_MS) {
        console.log(
          `[NetSuite] Using durable tools/list (${durable.tools.length} tools)`,
        );
      } else {
        console.log(
          `[NetSuite] Using durable stale tools/list (${durable.tools.length} tools); refreshing in background`,
        );
        scheduleMcpToolsRefresh(userId, accountId);
      }
      return materializeNetSuiteMcpTools({
        mcpTools: durable.tools as MCPTool[],
        userId,
        accountId,
        netsuiteMcpTools: effectiveMcpToolSettings,
      });
    }

    const accessToken = await getNetSuiteToken(userId, accountId);
    if (!accessToken) {
      console.log("[NetSuite] No access token found for user:", userId);
      return EMPTY_LOADED_MCP_TOOLS;
    }

    console.log("[NetSuite] Loading MCP tools (cold)...");
    const mcpTools = await fetchMCPTools(userId, accessToken, accountId);
    if (!Array.isArray(mcpTools)) {
      console.error(
        "[NetSuite] Tools response is not an array:",
        typeof mcpTools,
        mcpTools,
      );
      return EMPTY_LOADED_MCP_TOOLS;
    }

    console.log(`[NetSuite] Received ${mcpTools.length} tools from NetSuite`);
    return materializeNetSuiteMcpTools({
      mcpTools,
      userId,
      accountId,
      netsuiteMcpTools: effectiveMcpToolSettings,
    });
  } catch (error) {
    console.error("[NetSuite] Error fetching/creating tools:", error);
    return EMPTY_LOADED_MCP_TOOLS;
  }
}
