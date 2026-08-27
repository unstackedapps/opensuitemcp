"use client";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { AuthOidcFallbackNote } from "@/components/auth-oidc-fallback-note";
import {
  NetSuiteOidcLoginPicker,
  type OidcLoginOption,
} from "@/components/netsuite-oidc-login-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthOidcFallbackTab } from "@/hooks/use-auth-oidc-fallback-tab";

type OrgAuthTabsProps = {
  oidcOptions: OidcLoginOption[];
};

export function OrgAuthTabs({ oidcOptions }: OrgAuthTabsProps) {
  const hasOidc = oidcOptions.length > 0;
  const { tab, setTab, showFallbackNote, fallbackNote } =
    useAuthOidcFallbackTab("password");

  return (
    <Tabs className="w-full" onValueChange={setTab} value={tab}>
      <TabsList className="grid h-8 w-full grid-cols-2 p-0.5">
        <TabsTrigger className="h-7 text-[11px] sm:text-sm" value="netsuite">
          Sign-in with NetSuite
        </TabsTrigger>
        <TabsTrigger className="h-7 text-[11px] sm:text-sm" value="password">
          Basic Auth
        </TabsTrigger>
      </TabsList>

      <TabsContent className="mt-4 space-y-4" value="netsuite">
        {hasOidc ? (
          <NetSuiteOidcLoginPicker
            intent="login"
            options={oidcOptions}
            returnTo="/"
          />
        ) : (
          <p className="rounded-lg border border-dashed p-3 text-center text-muted-foreground text-xs">
            NetSuite sign-in is not configured yet. Ask your administrator to
            add an OIDC account.
          </p>
        )}
      </TabsContent>

      <TabsContent className="mt-4 space-y-4" value="password">
        {showFallbackNote ? (
          <AuthOidcFallbackNote message={fallbackNote} />
        ) : null}
        <LoginForm showSignUpLink={false} />
      </TabsContent>
    </Tabs>
  );
}
