export type EffectiveMcpPolicy = {
  enabled: boolean;
  /** "all" members, or only those the org listed. */
  memberAccess: "all" | "selected";
  /** False when the org narrowed access and this member is not on the list. */
  memberAllowed: boolean;
  maxKeysPerUser: number;
  /** True when an org owns the setting, so member UI renders it read-only. */
  managedByOrg: boolean;
};

export const DEFAULT_MAX_KEYS_PER_USER = 5;

/** Solo installs have no org row; the feature is on once the operator enables it. */
export function soloMcpPolicy(): EffectiveMcpPolicy {
  return {
    enabled: true,
    memberAccess: "all",
    memberAllowed: true,
    maxKeysPerUser: DEFAULT_MAX_KEYS_PER_USER,
    managedByOrg: false,
  };
}

/** Org installs stay closed until an admin opts the organization in. */
export function unconfiguredOrgMcpPolicy(): EffectiveMcpPolicy {
  return {
    enabled: false,
    memberAccess: "all",
    memberAllowed: false,
    maxKeysPerUser: DEFAULT_MAX_KEYS_PER_USER,
    managedByOrg: true,
  };
}
