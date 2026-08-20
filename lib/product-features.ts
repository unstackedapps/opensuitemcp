/**
 * Product surface toggles. Self-host keeps pack sync on; hosted overlay replaces
 * this file to disable operator-managed Oracle/Community sync from the UI.
 */
export const skillsPackSyncEnabled =
  process.env.DISABLE_SKILLS_PACK_SYNC !== "true";
