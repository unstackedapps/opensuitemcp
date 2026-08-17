/**
 * CLI: pnpm skills:sync
 * Pull Oracle + Community SKILL.md packs into local .data dirs.
 */
import { syncCommunitySkills } from "./sync-community";
import { syncOracleSkills } from "./sync-oracle";

async function main() {
  await syncOracleSkills();
  try {
    await syncCommunitySkills();
  } catch (error) {
    console.warn("[skills] Community sync failed:", error);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("[skills] Sync failed:", error);
    process.exit(1);
  });
