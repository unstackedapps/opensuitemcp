export type EffectiveMcpPolicy = {
  enabled: boolean;
  maxKeysPerUser: number;
  /** True when an org owns the setting, so member UI renders it read-only. */
  managedByOrg: boolean;
};

export const DEFAULT_MAX_KEYS_PER_USER = 5;

/** Solo installs have no org row; the feature is on once the operator enables it. */
export function soloMcpPolicy(): EffectiveMcpPolicy {
  return {
    enabled: true,
    maxKeysPerUser: DEFAULT_MAX_KEYS_PER_USER,
    managedByOrg: false,
  };
}

/** Org installs stay closed until an admin opts the organization in. */
export function unconfiguredOrgMcpPolicy(): EffectiveMcpPolicy {
  return {
    enabled: false,
    maxKeysPerUser: DEFAULT_MAX_KEYS_PER_USER,
    managedByOrg: true,
  };
}
