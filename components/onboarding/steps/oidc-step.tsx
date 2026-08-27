"use client";

import { NetsuitePanel } from "@/components/admin/netsuite-panel";
import type { OrgOidcAccountRow } from "@/lib/org/oidc-accounts";

type OnboardingOidcStepProps = {
  oidcAccounts?: OrgOidcAccountRow[];
};

export function OnboardingOidcStep({
  oidcAccounts = [],
}: OnboardingOidcStepProps) {
  return (
    <NetsuitePanel
      accounts={oidcAccounts}
      embedded={{
        title: "NetSuite OIDC Login Accounts",
        description:
          "Add additional NetSuite OIDC (OpenID Connect) integrations your team will use to sign in.",
      }}
      testReturnTo="/onboarding?step=oidc&netsuite_connected=true"
    />
  );
}
