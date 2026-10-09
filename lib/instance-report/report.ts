import "server-only";

import { sql } from "drizzle-orm";
import { APP_VERSION } from "@/lib/app-release";
import { db } from "@/lib/db/client";
import { getInstallMode } from "@/lib/org/install-config";
import { getUpdateStatus, type UpdateStatus } from "@/lib/updates/control";
import { type RecordedError, serverErrorLog } from "./errors";

/**
 * What an instance tells whoever operates it: its version, how many people use
 * it and how, whether NetSuite connections still work, and the server errors
 * it has seen. Counts only. No message text, no emails, no names.
 *
 * Bump REPORT_VERSION when a field changes meaning or goes away, so a reader
 * can tell which shape it holds.
 */
export const REPORT_VERSION = 1;

export type InstanceReport = {
  reportVersion: typeof REPORT_VERSION;
  generatedAt: string;
  app: {
    version: string;
    installMode: string;
    node: string;
    startedAt: string;
  };
  users: {
    total: number;
    disabled: number;
    newLast30Days: number;
    signedInLast7Days: number;
    signedInLast30Days: number;
  };
  orgs: number;
  activity: {
    /** Messages people sent. Chats an instance deletes take theirs with them. */
    messagesLast24Hours: number;
    messagesLast7Days: number;
    activeUsersLast7Days: number;
    runsLast7Days: number;
    failedRunsLast7Days: number;
    toolErrorsLast7Days: number;
    /** Tools agent apps called over MCP, and how many of those calls failed. */
    agentToolCallsLast7Days: number;
    agentToolErrorsLast7Days: number;
  };
  netsuite: {
    usersConnected: number;
    savedAccounts: number;
    /** A token is deleted when its refresh fails: these need connecting again. */
    accountsWithoutToken: number;
    tokensRefreshedLast7Days: number;
  };
  agentApps: {
    apiKeys: number;
    oauthApps: number;
    usedLast7Days: number;
  };
  /** Users with each provider type set up, and org-wide providers by name. */
  aiProviders: {
    users: Record<string, number>;
    org: Record<string, number>;
  };
  errors: {
    /** When this process began recording. A restart empties the list. */
    since: string;
    total: number;
    recent: RecordedError[];
  };
  database: {
    migrations: number;
    latestMigrationAt: string | null;
  };
  /** How this install updates, and how its last update went. */
  updates: Pick<
    UpdateStatus,
    "updater" | "latestVersion" | "pending" | "lastRun"
  > & {
    autoUpdate: boolean;
    allowRemote: boolean;
  };
};

type Row = Record<string, unknown>;

async function one(query: ReturnType<typeof sql>): Promise<Row> {
  const rows = (await db.execute(query)) as unknown as Row[];
  return rows[0] ?? {};
}

async function many(query: ReturnType<typeof sql>): Promise<Row[]> {
  return (await db.execute(query)) as unknown as Row[];
}

function count(row: Row, key: string): number {
  const value = Number(row[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function tally(rows: Row[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[String(row.key)] = count(row, "count");
  }
  return result;
}

/** Stored timestamps are UTC without a zone; `::timestamp` drops the Z. */
function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

const DAY = 24 * 60 * 60 * 1000;

export async function buildInstanceReport(): Promise<InstanceReport> {
  const day = ago(DAY);
  const week = ago(7 * DAY);
  const month = ago(30 * DAY);

  const [
    users,
    orgs,
    messages,
    runs,
    toolErrors,
    agentToolCalls,
    netsuite,
    agentApps,
    userProviders,
    orgProviders,
    migrations,
  ] = await Promise.all([
    one(sql`
      SELECT
        count(*) AS total,
        count(*) FILTER (WHERE status = 'disabled') AS disabled,
        count(*) FILTER (WHERE "createdAt" >= ${month}::timestamp) AS "newLast30Days",
        count(*) FILTER (WHERE "lastLoginAt" >= ${week}::timestamp) AS "signedInLast7Days",
        count(*) FILTER (WHERE "lastLoginAt" >= ${month}::timestamp) AS "signedInLast30Days"
      FROM "User"
    `),
    one(sql`SELECT count(*) AS total FROM "Org"`),
    one(sql`
      SELECT
        count(*) FILTER (WHERE m."createdAt" >= ${day}::timestamp) AS "last24Hours",
        count(*) AS "last7Days",
        count(DISTINCT c."userId") AS "activeUsers"
      FROM "Message" m
      JOIN "Chat" c ON c.id = m."chatId"
      WHERE m.role = 'user' AND m."createdAt" >= ${week}::timestamp
    `),
    one(sql`
      SELECT
        count(*) AS total,
        count(*) FILTER (WHERE outcome = 'error') AS failed
      FROM "Stream"
      WHERE "createdAt" >= ${week}::timestamp
    `),
    one(sql`
      SELECT count(*) AS total
      FROM "Message" m,
        json_array_elements(
          CASE WHEN json_typeof(m.parts) = 'array' THEN m.parts ELSE '[]'::json END
        ) AS part
      WHERE m."createdAt" >= ${week}::timestamp
        AND part->>'state' = 'output-error'
    `),
    one(sql`
      SELECT
        COALESCE(sum(calls), 0) AS calls,
        COALESCE(sum(errors), 0) AS errors
      FROM "McpToolCallHourly"
      WHERE hour >= ${week}::timestamp
    `),
    one(sql`
      WITH saved AS (
        SELECT s."userId", s."netsuiteAccountId" AS active, acct.id
        FROM "UserSettings" s
        CROSS JOIN LATERAL (
          SELECT upper(e->>'accountId') AS id
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(s."netsuiteAccounts") = 'array'
              THEN s."netsuiteAccounts" ELSE '[]'::jsonb END
          ) AS e
          WHERE COALESCE(e->>'accountId', '') <> ''
          UNION
          SELECT upper(s."netsuiteAccountId")
          WHERE COALESCE(s."netsuiteAccountId", '') <> ''
        ) AS acct
      )
      SELECT
        count(DISTINCT "userId") AS "usersConnected",
        count(*) AS "savedAccounts",
        count(*) FILTER (
          WHERE NOT EXISTS (
            SELECT 1 FROM "NetSuiteToken" t
            WHERE t."userId" = saved."userId"
              AND (
                upper(t."accountId") = saved.id
                OR (t."accountId" IS NULL AND upper(saved.active) = saved.id)
              )
          )
        ) AS "accountsWithoutToken",
        (
          SELECT count(*) FROM "NetSuiteToken"
          WHERE "updatedAt" >= ${week}::timestamp
        ) AS "tokensRefreshedLast7Days"
      FROM saved
    `),
    one(sql`
      SELECT
        (SELECT count(*) FROM "McpApiKey" WHERE "revokedAt" IS NULL) AS "apiKeys",
        (SELECT count(*) FROM "OAuthGrant" WHERE "revokedAt" IS NULL) AS "oauthApps",
        (
          (SELECT count(*) FROM "McpApiKey"
            WHERE "revokedAt" IS NULL AND "lastUsedAt" >= ${week}::timestamp)
          + (SELECT count(*) FROM "OAuthGrant"
            WHERE "revokedAt" IS NULL AND "lastUsedAt" >= ${week}::timestamp)
        ) AS "usedLast7Days"
    `),
    many(sql`
      SELECT key, count(DISTINCT "userId") AS count
      FROM (
        SELECT s."userId", p->>'type' AS key
        FROM "UserSettings" s,
          jsonb_array_elements(
            CASE WHEN jsonb_typeof(s."aiProviders"->'providers') = 'array'
              THEN s."aiProviders"->'providers' ELSE '[]'::jsonb END
          ) AS p
        UNION ALL SELECT "userId", 'google' FROM "UserSettings" WHERE "googleApiKey" IS NOT NULL
        UNION ALL SELECT "userId", 'anthropic' FROM "UserSettings" WHERE "anthropicApiKey" IS NOT NULL
        UNION ALL SELECT "userId", 'openai' FROM "UserSettings" WHERE "openaiApiKey" IS NOT NULL
      ) types
      WHERE key IS NOT NULL
      GROUP BY key
    `),
    many(sql`
      SELECT provider AS key, count(*) AS count
      FROM "OrgLlmProvider"
      WHERE enabled
      GROUP BY provider
    `),
    one(sql`
      SELECT count(*) AS total, max(created_at) AS latest
      FROM drizzle.__drizzle_migrations
    `),
  ]);

  const errors = serverErrorLog();
  const latestMigration = Number(migrations.latest);
  const updates = await getUpdateStatus();

  return {
    reportVersion: REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    app: {
      version: APP_VERSION,
      installMode: getInstallMode(),
      node: process.version,
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    },
    users: {
      total: count(users, "total"),
      disabled: count(users, "disabled"),
      newLast30Days: count(users, "newLast30Days"),
      signedInLast7Days: count(users, "signedInLast7Days"),
      signedInLast30Days: count(users, "signedInLast30Days"),
    },
    orgs: count(orgs, "total"),
    activity: {
      messagesLast24Hours: count(messages, "last24Hours"),
      messagesLast7Days: count(messages, "last7Days"),
      activeUsersLast7Days: count(messages, "activeUsers"),
      runsLast7Days: count(runs, "total"),
      failedRunsLast7Days: count(runs, "failed"),
      toolErrorsLast7Days: count(toolErrors, "total"),
      agentToolCallsLast7Days: count(agentToolCalls, "calls"),
      agentToolErrorsLast7Days: count(agentToolCalls, "errors"),
    },
    netsuite: {
      usersConnected: count(netsuite, "usersConnected"),
      savedAccounts: count(netsuite, "savedAccounts"),
      accountsWithoutToken: count(netsuite, "accountsWithoutToken"),
      tokensRefreshedLast7Days: count(netsuite, "tokensRefreshedLast7Days"),
    },
    agentApps: {
      apiKeys: count(agentApps, "apiKeys"),
      oauthApps: count(agentApps, "oauthApps"),
      usedLast7Days: count(agentApps, "usedLast7Days"),
    },
    aiProviders: {
      users: tally(userProviders),
      org: tally(orgProviders),
    },
    errors: {
      since: errors.startedAt,
      total: errors.total,
      recent: errors.recent,
    },
    database: {
      migrations: count(migrations, "total"),
      latestMigrationAt:
        Number.isFinite(latestMigration) && latestMigration > 0
          ? new Date(latestMigration).toISOString()
          : null,
    },
    updates: {
      updater: updates.updater,
      latestVersion: updates.latestVersion,
      pending: updates.pending,
      lastRun: updates.lastRun,
      autoUpdate: updates.policy.autoUpdate,
      allowRemote: updates.policy.allowRemote,
    },
  };
}
