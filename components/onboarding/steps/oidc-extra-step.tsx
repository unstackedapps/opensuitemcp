"use client";

import { NetSuiteOidcLoginSettings } from "@/components/netsuite-oidc-login-settings";

export function OnboardingOidcExtraStep() {
  return (
    <NetSuiteOidcLoginSettings
      active
      embedded={{
        title: "NetSuite OIDC Login Accounts",
        description:
          "Optional: add NetSuite OIDC so you can sign in without a password. Test the connection after saving. Skip if you only use email sign-in.",
      }}
      testReturnTo="/onboarding?step=oidc-extra&netsuite_connected=true"
    />
  );
}
