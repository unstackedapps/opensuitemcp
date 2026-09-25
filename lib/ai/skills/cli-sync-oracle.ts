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

  // Reported, not fatal — the same answer the Community sync below already
  // gives. This runs from the container entrypoint under `set -e`, before the
  // server starts, so exiting non-zero here turned an unreachable Oracle into
  // an app that never came up: the boot repeated, and re-ran migrations, every
  // few seconds. Skills stay at the last pack that synced, which is a worse
  // install than a fresh sync and a far better one than no install at all.
  try {
    await withSkillSyncRetry("Oracle sync", syncOracleSkills);
  } catch (error) {
    console.error(
      `[skills] Oracle sync failed after ${attempts} attempt(s): ${formatSkillSyncError(error)}. Continuing with the packs already on disk.`,
    );
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
