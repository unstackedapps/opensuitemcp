import type { McpKeyScope } from "@/lib/db/schema";

export type EffectiveMcpPolicy = {
  enabled: boolean;
  allowWriteScope: boolean;
  maxKeysPerUser: number;
  /** True when an org owns the setting, so member UI renders it read-only. */
  managedByOrg: boolean;
};

export const DEFAULT_MAX_KEYS_PER_USER = 5;

/** Solo installs have no org row; the feature is on once the operator enables it. */
export function soloMcpPolicy(): EffectiveMcpPolicy {
  return {
    enabled: true,
    allowWriteScope: true,
    maxKeysPerUser: DEFAULT_MAX_KEYS_PER_USER,
    managedByOrg: false,
  };
}

/** Org installs stay closed until an admin opts the organization in. */
export function unconfiguredOrgMcpPolicy(): EffectiveMcpPolicy {
  return {
    enabled: false,
    allowWriteScope: false,
    maxKeysPerUser: DEFAULT_MAX_KEYS_PER_USER,
    managedByOrg: true,
  };
}

/**
 * Narrow requested scopes to what policy permits.
 *
 * Returning the allowed set rather than throwing lets a key downgrade to
 * read-only instead of failing, and `read` is always implied so no key can be
 * write-without-read.
 */
export function applyScopePolicy(
  requested: McpKeyScope[],
  policy: Pick<EffectiveMcpPolicy, "allowWriteScope">,
): McpKeyScope[] {
  const unique = new Set<McpKeyScope>(requested);
  unique.add("read");
  if (!policy.allowWriteScope) {
    unique.delete("write");
  }
  return unique.has("write") ? ["read", "write"] : ["read"];
}
