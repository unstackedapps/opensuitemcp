"use client";

import { useMemo, useState } from "react";
import { AUTH_FIELD_LABEL_CLASS } from "@/components/auth-field-styles";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type OidcLoginOption = {
  accountId: string;
  label: string;
};

export function buildNetSuiteOidcAuthorizeHref({
  accountId,
  intent,
  returnTo,
}: {
  accountId: string;
  intent: "login" | "bootstrap" | "test";
  returnTo?: string;
}): string {
  const params = new URLSearchParams({
    intent,
    accountId,
  });
  if (returnTo) {
    params.set("returnTo", returnTo);
  }
  return `/api/auth/netsuite/authorize?${params.toString()}`;
}

type NetSuiteOidcTestConnectionButtonProps = {
  accountId: string;
  returnTo: string;
  className?: string;
  disabled?: boolean;
  label?: string;
};

export function NetSuiteOidcTestConnectionButton({
  accountId,
  returnTo,
  className,
  disabled = false,
  label = "Test connection",
}: NetSuiteOidcTestConnectionButtonProps) {
  const href = buildNetSuiteOidcAuthorizeHref({
    accountId,
    intent: "test",
    returnTo,
  });

  return (
    <Button
      asChild
      className={cn(className, disabled && "pointer-events-none opacity-50")}
    >
      <a href={href}>{label}</a>
    </Button>
  );
}

type NetSuiteOidcLoginPickerProps = {
  options: OidcLoginOption[];
  intent: "login" | "bootstrap" | "test";
  returnTo?: string;
  className?: string;
  actionLabel?: string;
};

export function NetSuiteOidcLoginPicker({
  options,
  intent,
  returnTo,
  className,
  actionLabel,
}: NetSuiteOidcLoginPickerProps) {
  const [accountId, setAccountId] = useState(options[0]?.accountId ?? "");

  const authorizeHref = useMemo(() => {
    if (!accountId) {
      return "#";
    }
    return buildNetSuiteOidcAuthorizeHref({ accountId, intent, returnTo });
  }, [accountId, intent, returnTo]);

  if (options.length === 0) {
    return null;
  }

  const isCompact = intent === "test";

  const authorizeButton = (
    <Button
      asChild
      className={cn(isCompact ? "h-8 shrink-0 px-2.5 text-xs" : "h-9 w-full")}
    >
      <a href={authorizeHref}>
        {intent === "test"
          ? (actionLabel ?? "Test")
          : (actionLabel ?? "Sign in with NetSuite")}
      </a>
    </Button>
  );

  const accountSelect = (
    <Select onValueChange={setAccountId} value={accountId}>
      <SelectTrigger
        className={cn(
          "h-8 text-sm",
          isCompact ? "w-full md:h-8 md:px-2.5 md:py-1" : "w-full",
        )}
        id="netsuite-oidc-account"
      >
        <SelectValue placeholder="Select account" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.accountId} value={option.accountId}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="space-y-2">
        <Label
          className={AUTH_FIELD_LABEL_CLASS}
          htmlFor="netsuite-oidc-account"
        >
          NetSuite account
        </Label>
        {isCompact ? (
          <div className="flex max-w-md items-center gap-2">
            <div className="min-w-0 flex-1">{accountSelect}</div>
            {authorizeButton}
          </div>
        ) : (
          accountSelect
        )}
        {isCompact ? null : (
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Choose from the list of connected NetSuite OIDC login accounts to
            continue.
          </p>
        )}
      </div>

      {isCompact ? null : authorizeButton}
    </div>
  );
}
