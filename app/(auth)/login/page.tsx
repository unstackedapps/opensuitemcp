import { Suspense } from "react";
import { OrgAuthTabs } from "@/app/(auth)/login/org-auth-tabs";
import { SoloAuthTabs } from "@/app/(auth)/login/solo-auth-tabs";
import { AuthBrand } from "@/components/auth-brand";
import { NetSuiteAuthErrorToast } from "@/components/netsuite-auth-error-toast";
import { isOrgInstallMode } from "@/lib/org/install-config";
import { listLoginOidcOptions } from "@/lib/org/oidc-accounts";
import { isSoloBootstrapOpen } from "@/lib/org/solo-bootstrap";

export default async function Page() {
  const oidcOptions = await listLoginOidcOptions();
  const isOrgMode = isOrgInstallMode();
  const isInitialSoloSetup = !isOrgMode && (await isSoloBootstrapOpen());
  const allowPublicRegister = isInitialSoloSetup;

  return (
    <div className="flex h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <Suspense fallback={null}>
        <NetSuiteAuthErrorToast />
      </Suspense>
      <div className="flex w-full max-w-md flex-col gap-8 px-4 sm:px-0">
        <div className="flex flex-col items-center text-center">
          <AuthBrand size="lg" />
          {!isOrgMode ? (
            <p className="mt-3 text-muted-foreground text-sm">
              {isInitialSoloSetup
                ? "Create your account with NetSuite or email."
                : "Sign in with NetSuite or email."}
            </p>
          ) : null}
        </div>

        {isOrgMode ? (
          <Suspense fallback={null}>
            <OrgAuthTabs oidcOptions={oidcOptions} />
          </Suspense>
        ) : (
          <Suspense fallback={null}>
            <SoloAuthTabs
              allowPublicRegister={allowPublicRegister}
              isInitialSetup={isInitialSoloSetup}
              oidcOptions={oidcOptions}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
