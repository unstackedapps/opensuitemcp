import "@/lib/db/load-env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { applyOrgMigrateBootstrapIfNeeded } from "@/lib/org/migrate-bootstrap";
import { applyRootEmailOwnerIfConfigured } from "@/lib/org/promote-root-email";

const runMigrate = async () => {
  if (!process.env.POSTGRES_URL) {
    throw new Error(
      "POSTGRES_URL is not defined. Run pnpm setup:backend to create .env.local and start Postgres, or set POSTGRES_URL in .env.local.",
    );
  }

  const connection = postgres(process.env.POSTGRES_URL, { max: 1 });
  const db = drizzle(connection);

  console.log("⏳ Running migrations...");

  const start = Date.now();
  await migrate(db, { migrationsFolder: "./lib/db/migrations" });
  await applyOrgMigrateBootstrapIfNeeded();
  await applyRootEmailOwnerIfConfigured();
  const end = Date.now();

  console.log("✅ Migrations completed in", end - start, "ms");
  await connection.end({ timeout: 5 });
  process.exit(0);
};

runMigrate().catch((err) => {
  console.error("❌ Migration failed");
  console.error(err);
  process.exit(1);
});
