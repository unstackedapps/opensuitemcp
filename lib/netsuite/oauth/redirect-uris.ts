import { getPublicAppOrigin } from "@/lib/http/public-origin";

function getAppOrigin(): string {
  return getPublicAppOrigin();
}

/** MCP connect callback (existing Settings → Connect flow). */
export function getNetSuiteMcpRedirectUri(): string {
  return `${getAppOrigin()}/api/netsuite/callback`;
}

/** NetSuite OIDC login callback (app sign-in / org bootstrap). */
export function getNetSuiteLoginRedirectUri(): string {
  return `${getAppOrigin()}/api/auth/netsuite/callback`;
}

/** @deprecated Use getNetSuiteMcpRedirectUri — kept for existing imports. */
export function getNetSuiteRedirectUri(): string {
  return getNetSuiteMcpRedirectUri();
}
