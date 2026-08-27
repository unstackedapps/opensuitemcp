import { Suspense } from "react";
import { AuthBrand } from "@/components/auth-brand";
import { NetSuiteAuthErrorToast } from "@/components/netsuite-auth-error-toast";
import {
  getBootstrapConfigError,
  hasEnvOidcLoginConfig,
  isOrgBootstrapConfigured,
} from "@/lib/org/bootstrap-config";
import { getNetSuiteAccountIdFromEnv } from "@/lib/org/install-config";
import { redirectIfOrgReady } from "@/lib/org/setup";
import { SetupForm } from "./setup-form";

export default async function SetupPage() {
  await redirectIfOrgReady();

  const bootstrapConfigured = isOrgBootstrapConfigured();
  const bootstrapMessage = getBootstrapConfigError();
  const envOidcAccountId = hasEnvOidcLoginConfig()
    ? getNetSuiteAccountIdFromEnv()
    : null;

  return (
    <div className="flex min-h-dvh w-full items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <Suspense fallback={null}>
        <NetSuiteAuthErrorToast />
      </Suspense>
      <div className="flex w-full max-w-md flex-col gap-8 px-4 sm:px-0">
        <div className="flex flex-col items-center gap-6 text-center">
          <AuthBrand size="lg" />
          <div className="flex flex-col gap-2">
            <h1 className="font-semibold text-xl">Set up your organization</h1>
            <p className="text-muted-foreground text-sm">
              Select a sign-in method
            </p>
          </div>
        </div>

        {!bootstrapConfigured ? (
          <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
            {bootstrapMessage}
          </div>
        ) : (
          <Suspense fallback={null}>
            <SetupForm envOidcAccountId={envOidcAccountId} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
