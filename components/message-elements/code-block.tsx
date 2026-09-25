"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  oneDark,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader } from "./loader";

const HIGHLIGHT_DEFER_CHARS = 8000;

type CodeBlockContextType = {
  code: string;
};

const CodeBlockContext = createContext<CodeBlockContextType>({
  code: "",
});

const HIGHLIGHT_BASE = {
  margin: 0,
  padding: "0.5rem",
  fontSize: "0.75rem",
  background: "hsl(var(--background))",
  color: "hsl(var(--foreground))",
} as const;

/** Inside a chat bubble: nothing may overflow sideways, so lines wrap. */
const WRAPPED_HIGHLIGHT_STYLE = {
  ...HIGHLIGHT_BASE,
  overflow: "hidden",
  overflowX: "hidden",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  whiteSpace: "pre-wrap",
  maxWidth: "100%",
} as const;

/**
 * Given a pane of its own: lines keep their length and the block scrolls.
 *
 * These have to be inline rather than classes — the highlighter writes its own
 * style attribute, and an inline rule beats any class we could put on it.
 */
const SCROLLED_HIGHLIGHT_STYLE = {
  ...HIGHLIGHT_BASE,
  overflowX: "auto",
  overflowY: "hidden",
  overflowWrap: "normal",
  wordBreak: "normal",
  whiteSpace: "pre",
} as const;

const CODE_BLOCK_FRAME_CLASSNAME =
  "relative w-full min-w-0 max-w-full rounded-md border bg-background text-foreground";

/** Wrapping keeps a block inside a chat bubble; nothing overflows sideways. */
const WRAPPED_CLASSNAME =
  "overflow-hidden [&_code]:wrap-break-word [&_code]:whitespace-pre-wrap [&_pre]:max-w-full [&_pre]:overflow-x-hidden [&_pre]:whitespace-pre-wrap [&_pre]:wrap-break-word";

/**
 * Scrolling is for a block with room of its own. Code wrapped mid-token is
 * harder to read than code you scroll, and indentation is most of how a script
 * is read at all — which is the whole reason for moving it somewhere wider.
 */
const SCROLLED_CLASSNAME =
  // Marked important on purpose. The highlighter writes its own style
  // attribute on the `pre`, and an inline rule beats any ordinary class we
  // could hand it — so the one place this can be stated is here.
  "overflow-hidden [&_code]:whitespace-pre [&_code]:[overflow-wrap:normal] [&_code]:[word-break:normal] [&_pre]:!overflow-x-auto [&_pre]:!overflow-y-hidden [&_pre]:!whitespace-pre [&_pre]:min-w-full";

function WrappingPre({ className, style, ...props }: ComponentProps<"pre">) {
  return (
    <pre
      {...props}
      // No wrapping decision of its own: the frame above sets wrapped or
      // scrolled for every element inside it, and a hardcoded rule here would
      // win over the scrolled one by specificity of being inline.
      className={cn("max-w-full", className)}
      style={{
        ...style,
        maxWidth: "100%",
        overflow: "hidden",
        overflowX: "hidden",
        overflowWrap: "anywhere",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    />
  );
}

function useDeferredCodeHighlight(code: string): boolean {
  const [preparedCode, setPreparedCode] = useState<string | undefined>(() =>
    code.length > HIGHLIGHT_DEFER_CHARS ? undefined : code,
  );

  useEffect(() => {
    if (code.length <= HIGHLIGHT_DEFER_CHARS) {
      setPreparedCode(code);
      return;
    }

    setPreparedCode(undefined);
    const timeoutId = window.setTimeout(() => {
      setPreparedCode(code);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [code]);

  return preparedCode === code;
}

function CodeBlockLoading() {
  return (
    <div
      className="flex min-h-16 items-center justify-center gap-2 p-3"
      data-testid="code-block-loading"
      role="status"
    >
      <Loader
        className="text-muted-foreground motion-reduce:animate-none"
        size={14}
      />
      <span className="text-[11px] text-muted-foreground md:text-xs">
        Formatting output
      </span>
    </div>
  );
}

function CodeBlockHighlight({
  children,
  code,
  language,
  showLineNumbers,
  wrap,
}: {
  code: string;
  language: string;
  showLineNumbers: boolean;
  wrap: boolean;
  children?: ReactNode;
}) {
  const codeClassName = wrap
    ? "font-mono text-xs wrap-break-word whitespace-pre-wrap"
    : "font-mono text-xs whitespace-pre";
  const highlightStyle = wrap
    ? WRAPPED_HIGHLIGHT_STYLE
    : SCROLLED_HIGHLIGHT_STYLE;
  return (
    <div className="relative">
      <SyntaxHighlighter
        PreTag={WrappingPre}
        className={cn(wrap && "overflow-hidden", "dark:hidden")}
        codeTagProps={{ className: codeClassName }}
        customStyle={highlightStyle}
        language={language}
        lineNumberStyle={{
          color: "hsl(var(--muted-foreground))",
          paddingRight: "1rem",
          minWidth: "2.5rem",
        }}
        showLineNumbers={showLineNumbers}
        style={oneLight}
        wrapLongLines={wrap}
      >
        {code}
      </SyntaxHighlighter>
      <SyntaxHighlighter
        PreTag={WrappingPre}
        className={cn("hidden", wrap && "overflow-hidden", "dark:block")}
        codeTagProps={{ className: codeClassName }}
        customStyle={highlightStyle}
        language={language}
        lineNumberStyle={{
          color: "hsl(var(--muted-foreground))",
          paddingRight: "1rem",
          minWidth: "2.5rem",
        }}
        showLineNumbers={showLineNumbers}
        style={oneDark}
        wrapLongLines={wrap}
      >
        {code}
      </SyntaxHighlighter>
      {children ? (
        <div className="absolute top-2 right-2 flex items-center gap-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language: string;
  showLineNumbers?: boolean;
  /** False scrolls long lines instead of wrapping them. */
  wrap?: boolean;
  children?: ReactNode;
};

export const CodeBlock = ({
  code,
  language,
  showLineNumbers = false,
  wrap = true,
  className,
  children,
  ...props
}: CodeBlockProps) => {
  const isHighlighted = useDeferredCodeHighlight(code);

  return (
    <CodeBlockContext.Provider value={{ code }}>
      <div
        className={cn(
          CODE_BLOCK_FRAME_CLASSNAME,
          wrap ? WRAPPED_CLASSNAME : SCROLLED_CLASSNAME,
          className,
        )}
        {...props}
        aria-busy={!isHighlighted}
      >
        {isHighlighted ? (
          <CodeBlockHighlight
            code={code}
            language={language}
            showLineNumbers={showLineNumbers}
            wrap={wrap}
          >
            {children}
          </CodeBlockHighlight>
        ) : (
          <CodeBlockLoading />
        )}
      </div>
    </CodeBlockContext.Provider>
  );
};

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

export const CodeBlockCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: CodeBlockCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const { code } = useContext(CodeBlockContext);

  const copyToClipboard = async () => {
    if (typeof window === "undefined" || !navigator.clipboard.writeText) {
      onError?.(new Error("Clipboard API not available"));
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      onCopy?.();
      setTimeout(() => setIsCopied(false), timeout);
    } catch (error) {
      onError?.(error as Error);
    }
  };

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <Button
      className={cn("shrink-0", className)}
      onClick={copyToClipboard}
      size="icon"
      variant="ghost"
      {...props}
    >
      {children ?? <Icon size={14} />}
    </Button>
  );
};
