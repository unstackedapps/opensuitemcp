"use client";

import { CheckIcon, CopyIcon, DownloadIcon, XIcon } from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { CodeBlock } from "@/components/message-elements/code-block";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvas } from "./context";

const MIN_WIDTH = 360;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 520;
const WIDTH_KEY = "osmcp:canvas-width";

/** File extensions worth naming; anything else downloads as .txt. */
const EXTENSIONS: Record<string, string> = {
  json: "json",
  javascript: "js",
  typescript: "ts",
  sql: "sql",
  xml: "xml",
  yaml: "yaml",
  csv: "csv",
  markdown: "md",
  html: "html",
};

function readStoredWidth(): number {
  try {
    const stored = Number.parseInt(
      window.localStorage.getItem(WIDTH_KEY) ?? "",
      10,
    );
    if (Number.isFinite(stored)) {
      return Math.min(Math.max(stored, MIN_WIDTH), MAX_WIDTH);
    }
  } catch {
    // Private windows and blocked site data both land here. A default width is
    // a complete answer; the panel does not need storage to work.
  }
  return DEFAULT_WIDTH;
}

export function CanvasPanel() {
  const { content, closeCanvas } = useCanvas();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [copied, setCopied] = useState(false);
  const draggingRef = useRef(false);

  useEffect(() => setWidth(readStoredWidth()), []);

  // Escape closes the panel, the way it closes every other overlay here.
  useEffect(() => {
    if (!content) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCanvas();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [content, closeCanvas]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!draggingRef.current) {
        return;
      }
      // The panel is anchored right, so its width is the distance from the
      // pointer to the viewport edge.
      const next = Math.min(
        Math.max(window.innerWidth - event.clientX, MIN_WIDTH),
        MAX_WIDTH,
      );
      setWidth(next);
    };
    const onUp = () => {
      if (!draggingRef.current) {
        return;
      }
      draggingRef.current = false;
      document.body.style.userSelect = "";
      try {
        window.localStorage.setItem(WIDTH_KEY, String(width));
      } catch {
        // Not worth failing a resize over.
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [width]);

  const onCopy = useCallback(async () => {
    if (!(content && navigator.clipboard?.writeText)) {
      return;
    }
    await navigator.clipboard.writeText(content.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const onDownload = useCallback(() => {
    if (!content) {
      return;
    }
    const extension = EXTENSIONS[content.language] ?? "txt";
    const name = `${content.title.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "canvas"}.${extension}`;
    const url = URL.createObjectURL(
      new Blob([content.code], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [content]);

  if (!content) {
    return null;
  }

  const CopyGlyph = copied ? CheckIcon : CopyIcon;

  return (
    <div
      className={cn(
        // Desktop only. A split pane needs a second column to split into, and
        // a phone has one: full screen there was just a worse code viewer than
        // the fence the reader already had.
        "hidden flex-col border-border bg-background md:flex",
        // The dragged width is a preference, not a promise: max-w keeps a fixed
        // reserve for the conversation, so opening the sidebar narrows the
        // panel rather than pushing its far edge past the viewport.
        "md:relative md:w-(--canvas-width) md:max-w-[calc(100%-20rem)] md:shrink-0 md:border-l",
      )}
      // Inline style cannot carry a media query, so the dragged width rides a
      // custom property the md: class consumes. Below md the panel is full
      // screen and the width is ignored entirely.
      style={{ "--canvas-width": `${width}px` } as CSSProperties}
    >
      {/* Focusable and arrow-key operable: a pane you can only size by
          dragging is a pane a keyboard cannot size at all. */}
      {/* biome-ignore lint/a11y/useSemanticElements: <hr> is the semantic separator, but this is the ARIA window-splitter pattern — a focusable separator carrying a value — which <hr> cannot express. */}
      <div
        aria-label="Resize canvas"
        aria-orientation="vertical"
        aria-valuemax={MAX_WIDTH}
        aria-valuemin={MIN_WIDTH}
        aria-valuenow={width}
        className="-left-1 absolute inset-y-0 hidden w-2 cursor-col-resize outline-none focus-visible:bg-ring/60 md:block"
        onKeyDown={(event) => {
          const step = event.shiftKey ? 64 : 16;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            setWidth((w) => Math.min(w + step, MAX_WIDTH));
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            setWidth((w) => Math.max(w - step, MIN_WIDTH));
          }
        }}
        onMouseDown={() => {
          draggingRef.current = true;
          document.body.style.userSelect = "none";
        }}
        role="separator"
        tabIndex={0}
      />

      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <p
          className="min-w-0 flex-1 truncate font-medium text-sm"
          title={content.title}
        >
          {content.title}
        </p>
        <Button onClick={onCopy} size="sm" variant="ghost" title="Copy">
          <CopyGlyph className="size-4" />
          <span className="sr-only">Copy</span>
        </Button>
        <Button onClick={onDownload} size="sm" variant="ghost" title="Download">
          <DownloadIcon className="size-4" />
          <span className="sr-only">Download</span>
        </Button>
        <Button onClick={closeCanvas} size="sm" variant="ghost" title="Close">
          <XIcon className="size-4" />
          <span className="sr-only">Close canvas</span>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {/* Scrolled, not wrapped: code broken mid-token is harder to read
            than code you scroll, and indentation is most of how a script is
            read — which is the reason for moving it somewhere wider at all. */}
        <CodeBlock
          code={content.code}
          language={content.language}
          showLineNumbers
          wrap={false}
        />
      </div>
    </div>
  );
}
