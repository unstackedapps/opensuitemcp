"use client";

import { Button } from "@/components/ui/button";

type NetSuiteSignInButtonProps = {
  accountId: string;
  intent: "login" | "bootstrap";
  returnTo?: string;
  label?: string;
};

export function NetSuiteSignInButton({
  accountId,
  intent,
  returnTo,
  label,
}: NetSuiteSignInButtonProps) {
  const params = new URLSearchParams({
    intent,
    accountId,
  });
  if (returnTo) {
    params.set("returnTo", returnTo);
  }

  const displayLabel = label ?? "Sign in with NetSuite";

  return (
    <Button asChild className="h-9 w-full">
      <a href={`/api/auth/netsuite/authorize?${params.toString()}`}>
        {displayLabel}
      </a>
    </Button>
  );
}
