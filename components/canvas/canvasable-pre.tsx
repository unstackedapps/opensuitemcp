"use client";

import { Columns2Icon } from "lucide-react";
import type { ComponentProps, ReactElement } from "react";
import { isValidElement, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useCanvas } from "./context";

/**
 * Below this a fence is readable where it sits. A script worth opening
 * elsewhere is never this short.
 */
const CANVAS_WORTH_LINES = 12;

/** Language tags worth trusting; anything else is treated as untagged. */
const KNOWN_LANGUAGES = new Set([
  "javascript",
  "js",
  "typescript",
  "ts",
  "jsx",
  "tsx",
  "json",
  "sql",
  "xml",
  "html",
  "css",
  "yaml",
  "yml",
  "bash",
  "sh",
  "shell",
  "python",
  "py",
  "java",
  "csv",
  "markdown",
  "md",
  "diff",
]);

const ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  yml: "yaml",
  sh: "bash",
  shell: "bash",
  md: "markdown",
};

/**
 * Read the fence's own text and language out of the element markdown built.
 *
 * The child is the `code` element, whose className carries `language-xxx` when
 * the model tagged the fence. Smaller models frequently do not, and a guess at
 * the language would be a guess at the highlighting and at the download's file
 * extension both — so an untagged fence stays untagged.
 */
function readFence(
  children: unknown,
): { code: string; language: string } | null {
  if (!isValidElement(children)) {
    return null;
  }
  const props = (
    children as ReactElement<{ className?: string; children?: unknown }>
  ).props;
  const text = extractText(props.children);
  if (!text.trim()) {
    return null;
  }
  const tag = /language-([\w-]+)/
    .exec(props.className ?? "")?.[1]
    ?.toLowerCase();
  const language =
    tag && KNOWN_LANGUAGES.has(tag) ? (ALIASES[tag] ?? tag) : "text";
  return { code: text, language };
}

function extractText(node: unknown): string {
  if (typeof node === "string") {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join("");
  }
  if (isValidElement(node)) {
    return extractText(
      (node as ReactElement<{ children?: unknown }>).props.children,
    );
  }
  return "";
}

/**
 * A markdown code fence that can be opened in the canvas.
 *
 * Wraps rather than replaces: the fence keeps whatever chrome and highlighting
 * the markdown renderer gave it, and gains one button.
 */
export function CanvasablePre({ children, ...props }: ComponentProps<"pre">) {
  const { openCanvas, isOpenFor, available } = useCanvas();
  // One id per rendered fence. Identity by message and position needed both to
  // be threaded down, and reasoning renders through here without either — so
  // two fences of equal length inside one turn answered to the same id, and
  // opening one closed the other.
  const id = useId();
  const preRef = useRef<HTMLPreElement>(null);
  const [toolbar, setToolbar] = useState<HTMLElement | null>(null);

  const fence = readFence(children);
  const lines = fence ? fence.code.split("\n").length : 0;
  const worthCanvas =
    available && fence !== null && lines >= CANVAS_WORTH_LINES;

  // The markdown renderer gives a fence its own header, with the language on
  // one side and its copy control on the other. Canvas belongs in that row
  // beside them, not floating over the top of it — which is where an overlay
  // put it, covering the very buttons it sat next to.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `children` is not read here — it is the signal that the renderer rebuilt the fence, which is when the toolbar node must be found again.
  useEffect(() => {
    if (!worthCanvas) {
      setToolbar(null);
      return;
    }
    const header = preRef.current?.querySelector(":scope > div > div");
    const group = header?.querySelector(":scope > div");
    setToolbar(group instanceof HTMLElement ? group : null);
  }, [worthCanvas, children]);

  if (!(worthCanvas && fence)) {
    return (
      <pre {...props} ref={preRef}>
        {children}
      </pre>
    );
  }

  const title =
    fence.language === "text" ? "Code" : `${fence.language} · ${lines} lines`;
  const open = isOpenFor(id);

  const button = (
    <Button
      // A split pane needs a second column to split into. A phone has one, so
      // canvas is a desktop affordance and says nothing at all below md.
      className="hidden size-[22px] text-muted-foreground hover:text-foreground md:inline-flex"
      onClick={() =>
        openCanvas({ id, title, code: fence.code, language: fence.language })
      }
      size="icon"
      title={open ? "Close canvas" : "Open in canvas"}
      type="button"
      variant="ghost"
    >
      <Columns2Icon className="size-3.5" />
      <span className="sr-only">
        {open ? "Close canvas" : "Open in canvas"}
      </span>
    </Button>
  );

  return (
    <>
      <pre {...props} ref={preRef}>
        {children}
      </pre>
      {toolbar ? createPortal(button, toolbar) : null}
    </>
  );
}
