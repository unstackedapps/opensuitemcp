"use client";

import {
  AppBridge,
  PostMessageTransport,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { BookOpen, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "./toast";

export type McpAppLaunch = {
  resourceUri: string;
  toolName: string;
  title?: string;
  input?: Record<string, unknown>;
  /** Raw tools/call result from NetSuite / our wrapper (may be stale/truncated) */
  result: unknown;
};

type McpAppHostProps = {
  launch: McpAppLaunch | null;
  onOpenChange: (open: boolean) => void;
  /** When the MCP App asks to post a user message into chat */
  onUserMessage?: (text: string) => void;
};

/**
 * Keep the NetSuite CallToolResult shape intact.
 * Prompt Library reads `content[].text` (JSON with a `prompts` array) — do not
 * strip or re-wrap that text.
 */
function toCallToolResult(result: unknown): CallToolResult {
  if (result && typeof result === "object" && "content" in result) {
    return result as CallToolResult;
  }

  return {
    content: [
      {
        type: "text",
        text:
          typeof result === "string" ? result : JSON.stringify(result ?? null),
      },
    ],
  };
}

function summarizeResult(result: unknown): string {
  if (!result || typeof result !== "object") {
    return `type=${typeof result}`;
  }
  const record = result as Record<string, unknown>;
  if (Array.isArray(record.content) && record.content[0]) {
    const block = record.content[0] as { type?: string; text?: string };
    const text = block.text ?? "";
    let promptCount = "?";
    try {
      const parsed = JSON.parse(text) as { prompts?: unknown };
      promptCount = Array.isArray(parsed.prompts)
        ? String(parsed.prompts.length)
        : "0";
    } catch {
      promptCount = "unparsed";
    }
    return `content[0].text len=${text.length} prompts=${promptCount} isError=${Boolean(record.isError)}`;
  }
  return `keys=${Object.keys(record).join(",")}`;
}

function extractUserText(params: {
  content?: Array<{ type: string; text?: string }>;
}): string | null {
  const blocks = params.content ?? [];
  const texts = blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text?.trim())
    .filter((text): text is string => Boolean(text));
  if (texts.length === 0) {
    return null;
  }
  return texts.join("\n\n");
}

function attachLinkInterceptor(iframe: HTMLIFrameElement) {
  const doc = iframe.contentDocument;
  if (!doc) {
    return () => {};
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor) {
      return;
    }
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    try {
      const url = new URL(href, window.location.href).href;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // ignore invalid urls
    }
  };

  doc.addEventListener("click", onClick, true);
  return () => doc.removeEventListener("click", onClick, true);
}

export function McpAppHost({
  launch,
  onOpenChange,
  onUserMessage,
}: McpAppHostProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<AppBridge | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [toolResult, setToolResult] = useState<CallToolResult | null>(null);
  const [iframeHeight, setIframeHeight] = useState(560);

  const open = Boolean(launch);

  // Fetch HTML + fresh tool result when launch changes
  useEffect(() => {
    if (!launch) {
      setHtml(null);
      setToolResult(null);
      setStatus("loading");
      setError(null);
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setError(null);
    setHtml(null);
    setToolResult(null);

    void (async () => {
      try {
        const [resourceResponse, callResponse] = await Promise.all([
          fetch("/api/netsuite/mcp-resource", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uri: launch.resourceUri }),
          }),
          fetch("/api/netsuite/mcp-call", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: launch.toolName,
              // Match the SuiteApp's usual empty-args call
              arguments: launch.input ?? {},
            }),
          }),
        ]);

        const resourcePayload = await resourceResponse.json();
        if (!resourceResponse.ok) {
          throw new Error(resourcePayload.error || "Failed to load MCP App UI");
        }

        const callPayload = await callResponse.json();
        if (!callResponse.ok) {
          throw new Error(
            callPayload.error || "This NetSuite MCP tool is disabled.",
          );
        }
        const freshResult = toCallToolResult(callPayload);

        if (cancelled) {
          return;
        }

        console.log(
          `[MCP App] Fresh tool result for ${launch.toolName}:`,
          summarizeResult(freshResult),
        );

        setToolResult(freshResult);
        setHtml(resourcePayload.html as string);
      } catch (fetchError) {
        if (cancelled) {
          return;
        }
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load MCP App";
        setError(message);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [launch]);

  // Wire AppBridge once iframe has HTML + tool result
  useEffect(() => {
    if (!launch || !html || !toolResult || !iframeRef.current) {
      return;
    }

    const iframe = iframeRef.current;
    let cancelled = false;
    let bridge: AppBridge | null = null;
    let detachLinks: (() => void) | undefined;
    let setupStarted = false;
    const resendTimers: number[] = [];

    const setup = async () => {
      if (setupStarted || cancelled) {
        return;
      }
      setupStarted = true;

      try {
        await new Promise((resolve) => setTimeout(resolve, 30));
        if (cancelled || !iframe.contentWindow) {
          return;
        }

        detachLinks = attachLinkInterceptor(iframe);

        const appBridge = new AppBridge(
          null,
          { name: "OpenSuiteMCP", version: "1.0.0" },
          {
            openLinks: {},
            serverTools: {},
            serverResources: {},
            // Prompt Library calls updateModelContext after receiving prompts
            updateModelContext: { text: {} },
          },
          {
            hostContext: {
              theme: document.documentElement.classList.contains("dark")
                ? "dark"
                : "light",
              platform: "web",
              displayMode: "inline",
              availableDisplayModes: ["inline", "fullscreen"],
              containerDimensions: { width: 720, maxHeight: 720 },
            },
          },
        );
        bridge = appBridge;

        appBridge.oncalltool = async (params) => {
          console.log("[MCP App] View requested tools/call:", params.name);
          const response = await fetch("/api/netsuite/mcp-call", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: params.name,
              arguments: params.arguments ?? {},
            }),
          });
          const payload = await response.json();
          if (!response.ok) {
            const message =
              typeof payload.error === "string"
                ? payload.error
                : "This NetSuite MCP tool is disabled.";
            return {
              content: [{ type: "text", text: message }],
              isError: true,
            };
          }
          const result = toCallToolResult(payload);
          console.log(
            `[MCP App] tools/call ${params.name} →`,
            summarizeResult(result),
          );
          return result;
        };

        appBridge.onreadresource = async (params) => {
          const response = await fetch("/api/netsuite/mcp-resource", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uri: params.uri }),
          });
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error || "resources/read failed");
          }
          return {
            contents: [
              {
                uri: payload.uri,
                mimeType: payload.mimeType ?? RESOURCE_MIME_TYPE,
                text: payload.html,
                _meta: payload.meta ?? undefined,
              },
            ],
          };
        };

        appBridge.onmessage = async (params) => {
          const text = extractUserText(params);
          if (text && onUserMessage) {
            onUserMessage(text);
            onOpenChange(false);
          } else if (text) {
            toast({
              type: "success",
              description: "Prompt received from library — paste into chat.",
            });
            try {
              await navigator.clipboard.writeText(text);
            } catch {
              // ignore clipboard failures
            }
          }
          return {};
        };

        appBridge.onopenlink = async (params) => {
          window.open(params.url, "_blank", "noopener,noreferrer");
          return {};
        };

        // Required: Prompt Library awaits this after applying tool results.
        appBridge.onupdatemodelcontext = async (params) => {
          console.log(
            "[MCP App] updateModelContext:",
            params.content
              ?.map((block) =>
                block.type === "text" ? block.text?.slice(0, 160) : block.type,
              )
              .join(" | "),
          );
          return {};
        };

        appBridge.onsizechange = async ({ height }) => {
          if (typeof height === "number" && height > 200) {
            setIframeHeight(Math.min(Math.max(height, 320), 780));
          }
        };

        appBridge.onloggingmessage = (params) => {
          console.log("[MCP App log]", params);
        };

        const initialized = new Promise<void>((resolve) => {
          appBridge.oninitialized = () => {
            console.log("[MCP App] View initialized");
            resolve();
          };
        });

        await appBridge.connect(
          new PostMessageTransport(iframe.contentWindow, iframe.contentWindow),
        );

        const timedOut = await Promise.race([
          initialized.then(() => false),
          new Promise<boolean>((resolve) =>
            setTimeout(() => resolve(true), 12_000),
          ),
        ]);

        if (cancelled) {
          return;
        }

        if (timedOut) {
          console.warn(
            "[MCP App] Initialization timed out; sending tool result anyway",
          );
        }

        // App.connect() may still be finishing when it emits `initialized`.
        // Delay the first send so ontoolresult is fully wired (otherwise the
        // Prompt Library stays at 0 prompts forever).
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (cancelled) {
          return;
        }

        const sendResult = (label: string) => {
          if (cancelled || !bridge) {
            return;
          }
          try {
            console.log(`[MCP App] ${label}:`, summarizeResult(toolResult));
            bridge.sendToolInput({ arguments: launch.input ?? {} });
            bridge.sendToolResult(toolResult);
          } catch (sendError) {
            console.error(`[MCP App] ${label} failed:`, sendError);
          }
        };

        sendResult("Sending tool result");
        // Extra belated sends cover slower App.connect() completions.
        for (const delay of [300, 900]) {
          resendTimers.push(
            window.setTimeout(() => sendResult(`Resend @${delay}ms`), delay),
          );
        }

        bridgeRef.current = bridge;
        setStatus("ready");
      } catch (setupError) {
        console.error("[MCP App] Host setup failed:", setupError);
        if (!cancelled) {
          setError(
            setupError instanceof Error
              ? setupError.message
              : "Failed to start MCP App host",
          );
          setStatus("error");
        }
      }
    };

    const onLoad = () => {
      void setup();
    };

    iframe.addEventListener("load", onLoad);
    if (iframe.contentDocument?.readyState === "complete") {
      void setup();
    }

    return () => {
      cancelled = true;
      for (const timer of resendTimers) {
        window.clearTimeout(timer);
      }
      iframe.removeEventListener("load", onLoad);
      detachLinks?.();
      void bridge?.close?.();
      if (bridgeRef.current === bridge) {
        bridgeRef.current = null;
      }
    };
  }, [launch, html, toolResult, onUserMessage, onOpenChange]);

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          void bridgeRef.current?.close?.();
          bridgeRef.current = null;
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent
        className={cn(
          "flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0",
        )}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="size-4 text-muted-foreground" />
            {launch?.title || launch?.toolName || "NetSuite App"}
          </DialogTitle>
          <DialogDescription>
            Interactive NetSuite MCP App. Select a prompt to continue in chat.
          </DialogDescription>
        </DialogHeader>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
          {status === "error" ? (
            <div className="flex h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-destructive text-sm">{error}</p>
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Close
              </Button>
            </div>
          ) : null}

          {html && status !== "error" ? (
            <iframe
              className="block w-full border-0 bg-white"
              ref={iframeRef}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              srcDoc={html}
              style={{ height: iframeHeight }}
              title={launch?.title || "NetSuite MCP App"}
            />
          ) : null}

          {status === "loading" ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/90 text-muted-foreground text-sm backdrop-blur-[1px]">
              <Loader2 className="size-4 animate-spin" />
              Loading prompt library…
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
