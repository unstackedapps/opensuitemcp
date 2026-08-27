"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getNetSuiteRedirectUri } from "@/lib/netsuite/accounts";
import { cn } from "@/lib/utils";

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

type NetSuiteMcpRedirectUriFieldProps = {
  className?: string;
};

export function NetSuiteMcpRedirectUriField({
  className,
}: NetSuiteMcpRedirectUriFieldProps) {
  const [copied, setCopied] = useState(false);
  const redirectUri = getNetSuiteRedirectUri();

  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-muted-foreground text-[11px]">
        MCP OAuth redirect URI for this app instance:
      </p>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 font-mono text-foreground text-xs">
          {redirectUri}
        </code>
        <Button
          aria-label="Copy MCP redirect URI"
          className="size-8 shrink-0"
          onClick={() => {
            void copyText(redirectUri).then((ok) => {
              if (!ok) {
                return;
              }
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
          size="icon"
          type="button"
          variant="outline"
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
