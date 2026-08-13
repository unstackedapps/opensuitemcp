import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getUserSettings } from "@/lib/db/queries";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";
import { executeMCPTool } from "@/lib/netsuite/mcp";
import {
  isMcpToolAllowed,
  MCP_TOOL_DISABLED_MESSAGE,
} from "@/lib/netsuite/mcp-tool-settings";
import { getNetSuiteToken } from "@/lib/netsuite/tokens";

const bodySchema = z.object({
  name: z.string().min(1).max(256),
  arguments: z.record(z.unknown()).optional().default({}),
});

/**
 * POST /api/netsuite/mcp-call
 * Proxies tools/call for MCP App hosts running in the browser.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = await getNetSuiteToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json(
      { error: "NetSuite not connected" },
      { status: 400 },
    );
  }

  try {
    const parsed = bodySchema.parse(await request.json());
    const settings = await getUserSettings({ userId: session.user.id });
    const accountId = settings?.netsuiteAccountId
      ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
      : null;
    if (!isMcpToolAllowed(settings?.netsuiteMcpTools, accountId, parsed.name)) {
      return NextResponse.json(
        {
          error: MCP_TOOL_DISABLED_MESSAGE,
          isError: true,
          content: [{ type: "text", text: MCP_TOOL_DISABLED_MESSAGE }],
        },
        { status: 403 },
      );
    }
    const result = await executeMCPTool({
      userId: session.user.id,
      accessToken,
      toolName: parsed.name,
      toolParams: parsed.arguments,
    });

    // Log a compact shape so we can debug empty MCP Apps (e.g. prompt library).
    if (result && typeof result === "object") {
      const record = result as Record<string, unknown>;
      const shape: Record<string, unknown> = {
        keys: Object.keys(record),
        isError: record.isError ?? false,
      };
      for (const key of ["prompts", "templates", "items", "categories"]) {
        const value = record[key];
        if (Array.isArray(value)) {
          shape[key] = `array(${value.length})`;
        } else if (typeof value === "string") {
          shape[key] = `string(${value.length})`;
        }
      }
      if ("content" in record && Array.isArray(record.content)) {
        shape.content = record.content.map((item, index) => {
          if (!item || typeof item !== "object") {
            return { index, type: typeof item };
          }
          const block = item as Record<string, unknown>;
          const text = typeof block.text === "string" ? block.text : undefined;
          let parsedPreview: unknown;
          if (text) {
            try {
              const parsedJson = JSON.parse(text);
              parsedPreview = Array.isArray(parsedJson)
                ? `json-array(${parsedJson.length})`
                : parsedJson && typeof parsedJson === "object"
                  ? `json-object(keys=${Object.keys(parsedJson).join(",")})`
                  : typeof parsedJson;
            } catch {
              parsedPreview = "not-json";
            }
          }
          return {
            index,
            type: block.type,
            textLength: text?.length ?? 0,
            textPreview: text?.slice(0, 240) ?? null,
            parsedPreview,
            otherKeys: Object.keys(block).filter(
              (key) => key !== "type" && key !== "text",
            ),
          };
        });
      }
      if ("structuredContent" in record) {
        shape.structuredContent =
          record.structuredContent &&
          typeof record.structuredContent === "object"
            ? Object.keys(record.structuredContent as object)
            : typeof record.structuredContent;
      }
      console.log(
        `[MCP Call API] ${parsed.name} result shape:`,
        JSON.stringify(shape, null, 2),
      );
    } else {
      console.log(`[MCP Call API] ${parsed.name} result type:`, typeof result);
    }

    // Preserve NetSuite CallToolResult as-is. MCP Apps like Prompt Library
    // parse `content[].text` directly — do not rewrite that payload.
    if (
      result &&
      typeof result === "object" &&
      "content" in (result as Record<string, unknown>)
    ) {
      return NextResponse.json(result);
    }

    // NetSuite CustomTool-style objects sometimes stringify arrays
    const structured =
      result && typeof result === "object"
        ? ({ ...(result as Record<string, unknown>) } as Record<
            string,
            unknown
          >)
        : undefined;
    if (structured) {
      for (const key of Object.keys(structured)) {
        const value = structured[key];
        if (
          typeof value === "string" &&
          (value.startsWith("[") || value.startsWith("{"))
        ) {
          try {
            structured[key] = JSON.parse(value);
          } catch {
            // leave as string
          }
        }
      }
    }

    return NextResponse.json({
      content: [
        {
          type: "text",
          text:
            typeof result === "string"
              ? result
              : JSON.stringify(result ?? null),
        },
      ],
      structuredContent: structured,
    });
  } catch (error) {
    console.error("[MCP Call API] Error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        content: [
          {
            type: "text",
            text: error instanceof Error ? error.message : "Tool call failed",
          },
        ],
        isError: true,
      },
      { status: 200 },
    );
  }
}
