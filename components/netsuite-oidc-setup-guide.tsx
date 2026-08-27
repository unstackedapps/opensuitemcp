"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  NETSUITE_OIDC_LOGIN_REDIRECT_PATH,
  NETSUITE_OIDC_LOGIN_STEPS,
} from "@/lib/netsuite/oidc-login-guide";
import { cn } from "@/lib/utils";

type NetSuiteOidcSetupGuideProps = {
  className?: string;
};

export function NetSuiteOidcSetupGuide({
  className,
}: NetSuiteOidcSetupGuideProps) {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const redirectUri = origin
    ? `${origin}${NETSUITE_OIDC_LOGIN_REDIRECT_PATH}`
    : `{host}${NETSUITE_OIDC_LOGIN_REDIRECT_PATH}`;

  return (
    <>
      <button
        aria-label="NetSuite setup steps"
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border/80 bg-muted/40 font-medium text-[11px] text-muted-foreground leading-none transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        onClick={() => setOpen(true)}
        type="button"
      >
        ?
      </button>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="flex max-h-[calc(100dvh-5.5rem)] flex-col gap-0 p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b px-4 py-3 text-left">
            <DialogTitle className="text-base">
              NetSuite OIDC login setup
            </DialogTitle>
            <DialogDescription className="text-xs">
              Complete these steps in NetSuite as an administrator, then enter
              the account ID and client ID in this app. This is for sign-in, not
              MCP chat connect.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <p className="text-muted-foreground text-[11px]">
              Redirect URI:{" "}
              <code className="break-all text-[11px]">{redirectUri}</code>
            </p>
            <ol className="list-decimal space-y-2 pl-4 text-xs leading-relaxed">
              {NETSUITE_OIDC_LOGIN_STEPS.map((step) => (
                <li key={step.text}>
                  {step.text}
                  {step.details ? (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                      {step.details.map((detail) => {
                        if ("redirectUri" in detail) {
                          return (
                            <li key="redirect-uri">
                              Redirect URI:{" "}
                              <code className="break-all text-[11px]">
                                {redirectUri}
                              </code>
                            </li>
                          );
                        }
                        return <li key={detail.text}>{detail.text}</li>;
                      })}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>

          <DialogFooter className="shrink-0 border-t px-4 py-3">
            <Button
              className="h-8 px-2.5 text-xs"
              onClick={() => setOpen(false)}
              type="button"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
