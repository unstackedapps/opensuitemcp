import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const globalForDb = globalThis as typeof globalThis & {
  postgresClient?: ReturnType<typeof postgres>;
};

function createPostgresClient() {
  // biome-ignore lint: Forbidden non-null assertion.
  return postgres(process.env.POSTGRES_URL!, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
  });
}

const client = globalForDb.postgresClient ?? createPostgresClient();
if (process.env.NODE_ENV !== "production") {
  globalForDb.postgresClient = client;
}

export const db = drizzle(client);
