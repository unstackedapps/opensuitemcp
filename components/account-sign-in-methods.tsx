"use client";

import { Check, Circle, X } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";

type AccountSignInMethodsProps = {
  hasPassword: boolean;
  hasOidcAccess: boolean;
  oidcConfigured: boolean;
  oidcEmailLinked: boolean;
  oidcLoginEmails: string[];
  isSoloInstall: boolean;
  onConfigureOidc: () => void;
  onUpdated: () => void;
};

function SignInMethodRow({
  enabled,
  hint,
  label,
}: {
  enabled: boolean;
  hint?: string;
  label: string;
}) {
  return (
    <li className="flex items-start gap-2">
      {enabled ? (
        <Check
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
        />
      ) : (
        <Circle
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50"
        />
      )}
      <div className="min-w-0">
        <span className={enabled ? "text-sm" : "text-muted-foreground text-sm"}>
          {label}
        </span>
        {hint ? (
          <p className="text-[11px] text-muted-foreground leading-snug sm:text-xs">
            {hint}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function AccountSignInMethods({
  hasPassword,
  hasOidcAccess,
  oidcConfigured,
  oidcEmailLinked,
  oidcLoginEmails,
  isSoloInstall,
  onConfigureOidc,
  onUpdated,
}: AccountSignInMethodsProps) {
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const oidcEnabled = isSoloInstall
    ? oidcEmailLinked || hasOidcAccess
    : hasOidcAccess;
  const showOidcCta = isSoloInstall && oidcConfigured && !oidcEmailLinked;
  const showOidcSetupCta = isSoloInstall && !oidcConfigured;

  let oidcHint: string | undefined;
  if (isSoloInstall && oidcConfigured && !oidcEmailLinked) {
    oidcHint =
      "Verify NetSuite sign-in under NetSuite → Sign in to confirm configuration.";
  } else if (!oidcConfigured && isSoloInstall) {
    oidcHint = "Set up under NetSuite → Sign in.";
  } else if (!hasOidcAccess && !isSoloInstall) {
    oidcHint = "Ask an admin for NetSuite sign-in access.";
  }

  const handleRemoveEmail = async (email: string) => {
    setRemovingEmail(email);
    try {
      const response = await fetch("/api/user/oidc-login-emails", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast({
          type: "error",
          description: data.error ?? "Could not remove NetSuite login email.",
        });
        return;
      }
      toast({ type: "success", description: "NetSuite login email removed." });
      onUpdated();
    } catch {
      toast({
        type: "error",
        description: "Could not remove NetSuite login email.",
      });
    } finally {
      setRemovingEmail(null);
    }
  };

  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <p className="font-medium text-sm">Sign-in methods</p>

      <ul className="space-y-1.5">
        <SignInMethodRow enabled={hasPassword} label="Email & password" />
        <SignInMethodRow
          enabled={oidcEnabled}
          hint={oidcHint}
          label="NetSuite OIDC"
        />
      </ul>

      {isSoloInstall && oidcLoginEmails.length > 0 ? (
        <ul className="space-y-1">
          <p className="text-[11px] text-muted-foreground sm:text-xs">
            Linked emails
          </p>
          {oidcLoginEmails.map((email) => (
            <li
              className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1"
              key={email}
            >
              <span className="min-w-0 truncate font-mono text-[11px] sm:text-xs">
                {email}
              </span>
              <Button
                aria-label={`Remove ${email}`}
                className="size-6 shrink-0"
                disabled={removingEmail === email}
                onClick={() => void handleRemoveEmail(email)}
                type="button"
                variant="ghost"
              >
                <X className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {showOidcSetupCta || showOidcCta ? (
        <Button
          className="h-7 text-[11px] sm:h-8 sm:text-xs"
          onClick={onConfigureOidc}
          type="button"
          variant="outline"
        >
          {showOidcCta ? "Verify NetSuite sign-in" : "Set up NetSuite sign-in"}
        </Button>
      ) : null}
    </div>
  );
}
