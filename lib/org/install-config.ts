export type OsmcpInstallMode = "org" | "solo";

const LEGACY_ENV_ALIASES: Record<string, string> = {
  OSMCP_INSTALL_MODE: "OPENSUITE_INSTALL_MODE",
  OSMCP_ROOT_EMAIL: "OPENSUITE_ROOT_EMAIL",
  OSMCP_NS_ACCOUNT_ID: "OPENSUITE_NS_ACCOUNT_ID",
  OSMCP_NS_OIDC_CLIENT_ID: "OPENSUITE_NS_OIDC_CLIENT_ID",
  OSMCP_ENABLE_GUEST: "OPENSUITE_ENABLE_GUEST",
};

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (value) {
    return value;
  }

  const legacyName = LEGACY_ENV_ALIASES[name];
  if (!legacyName) {
    return undefined;
  }

  return process.env[legacyName]?.trim() || undefined;
}

/** Install mode set by `pnpm setup:backend` — org or solo self-host. */
export function getInstallMode(): OsmcpInstallMode {
  const explicit = readEnv("OSMCP_INSTALL_MODE");
  if (explicit === "org" || explicit === "solo") {
    return explicit;
  }

  // Legacy installs: root email implied org mode before OSMCP_INSTALL_MODE existed.
  if (readEnv("OSMCP_ROOT_EMAIL")) {
    return "org";
  }

  return "solo";
}

export function isOrgInstallMode(): boolean {
  return getInstallMode() === "org";
}

export function isSoloInstallMode(): boolean {
  return getInstallMode() === "solo";
}

export function normalizeInstallEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Email allowed to claim org owner during first-run bootstrap (org installs only). */
export function getRootEmail(): string | null {
  const value = readEnv("OSMCP_ROOT_EMAIL");
  if (!value) {
    return null;
  }
  return normalizeInstallEmail(value);
}

export function isRootEmailAllowed(email: string): boolean {
  const rootEmail = getRootEmail();
  if (!rootEmail) {
    return false;
  }
  return normalizeInstallEmail(email) === rootEmail;
}

export function isOrgBootstrapConfigured(): boolean {
  return isOrgInstallMode() && Boolean(getRootEmail());
}

export function getOrgBootstrapConfigError(): string | null {
  if (!isOrgInstallMode()) {
    return null;
  }
  if (getRootEmail()) {
    return null;
  }
  return "Set OSMCP_ROOT_EMAIL to the NetSuite user email that should become org owner.";
}

export function isGuestAuthEnabled(): boolean {
  return readEnv("OSMCP_ENABLE_GUEST") === "true";
}

export function getUnauthenticatedRedirectPath(): string {
  if (isOrgInstallMode()) {
    return "/setup";
  }
  return "/login";
}

export function getNetSuiteAccountIdFromEnv(): string | null {
  return readEnv("OSMCP_NS_ACCOUNT_ID") ?? null;
}

export function getNetSuiteOidcClientIdFromEnv(): string | null {
  return readEnv("OSMCP_NS_OIDC_CLIENT_ID") ?? null;
}
