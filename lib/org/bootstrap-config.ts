import "server-only";

import {
  getNetSuiteAccountIdFromEnv,
  getNetSuiteOidcClientIdFromEnv,
} from "@/lib/org/install-config";

export {
  getOrgBootstrapConfigError as getBootstrapConfigError,
  getRootEmail as getBootstrapRootEmail,
  isOrgBootstrapConfigured,
  isRootEmailAllowed as isBootstrapEmailAllowed,
  normalizeInstallEmail as normalizeBootstrapEmail,
} from "@/lib/org/install-config";

export type { OrgOidcLoginConfig } from "@/lib/org/oidc-accounts";

export {
  getNetSuiteLoginSetupHint,
  isNetSuiteLoginConfigured,
  listLoginOidcOptions,
} from "@/lib/org/oidc-accounts";

/** Env-only OIDC shortcut from install (used before DB accounts exist). */
export function hasEnvOidcLoginConfig(): boolean {
  return Boolean(
    getNetSuiteAccountIdFromEnv() && getNetSuiteOidcClientIdFromEnv(),
  );
}
