import "server-only";

import { countNonGuestUsers } from "@/lib/db/queries";
import { isSoloInstallMode } from "@/lib/org/install-config";
import { listLoginOidcOptions } from "@/lib/org/oidc-accounts";

/** True until the first password user or OIDC method exists. */
export async function isSoloBootstrapOpen(): Promise<boolean> {
  if (!isSoloInstallMode()) {
    return false;
  }

  if ((await countNonGuestUsers()) > 0) {
    return false;
  }

  const oidcOptions = await listLoginOidcOptions();
  return oidcOptions.length === 0;
}
