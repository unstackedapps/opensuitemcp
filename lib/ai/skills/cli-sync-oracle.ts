/**
 * CLI: pnpm skills:sync
 * Pull Oracle + Community SKILL.md packs into local .data dirs.
 */
import { syncCommunitySkills } from "./sync-community";
import { syncOracleSkills } from "./sync-oracle";
import {
  formatSkillSyncError,
  skillSyncAttemptCount,
  withSkillSyncRetry,
} from "./sync-with-retry";

async function main() {
  const attempts = skillSyncAttemptCount();

  try {
    await withSkillSyncRetry("Oracle sync", syncOracleSkills);
  } catch (error) {
    console.error(
      `[skills] Oracle sync failed after ${attempts} attempt(s): ${formatSkillSyncError(error)}`,
    );
    process.exit(1);
  }

  try {
    await withSkillSyncRetry("Community sync", syncCommunitySkills);
  } catch (error) {
    console.warn(
      `[skills] Community sync failed after ${attempts} attempt(s): ${formatSkillSyncError(error)}`,
    );
  }
}

main().catch((error) => {
  console.error(`[skills] Sync failed: ${formatSkillSyncError(error)}`);
  process.exit(1);
});
