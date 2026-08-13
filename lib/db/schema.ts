import type { InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  json,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { AiProviderConfig } from "../ai/provider-entries";
import type { CustomSkill } from "../ai/skills/catalog";
import type { NetsuiteMcpToolSettings } from "../netsuite/mcp-tool-settings";
import type { AppUsage } from "../usage";

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
  lastLoginAt: timestamp("lastLoginAt"),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  title: text("title").notNull(),
  summary: text("summary"), // Longer summary for tooltip (20-30 words)
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
  lastContext: jsonb("lastContext").$type<AppUsage | null>(),
  maxIterationsReached: boolean("maxIterationsReached")
    .notNull()
    .default(false),
  /** Per-chat AI provider override; null uses Settings default / legacy */
  aiProviderId: varchar("aiProviderId", { length: 64 }),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable("Message", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

export const vote = pgTable(
  "Vote",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  },
);

export type Vote = InferSelectModel<typeof vote>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  }),
);

export type Stream = InferSelectModel<typeof stream>;

export const netsuiteToken = pgTable("NetSuiteToken", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  accountId: varchar("accountId", { length: 64 }),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

export type NetSuiteToken = InferSelectModel<typeof netsuiteToken>;

export type NetSuiteAccountEntry = {
  accountId: string;
  label: string;
  clientId?: string | null;
};

export const userSettings = pgTable("UserSettings", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id)
    .unique(),
  googleApiKey: text("googleApiKey"), // Encrypted
  anthropicApiKey: text("anthropicApiKey"), // Encrypted
  openaiApiKey: text("openaiApiKey"), // Encrypted
  inceptionApiKey: text("inceptionApiKey"), // Legacy column; unused
  aiProvider: varchar("aiProvider", {
    length: 20,
    enum: ["google", "anthropic", "openai"],
  }).default("google"),
  /** Active NetSuite account used for MCP requests */
  netsuiteAccountId: varchar("netsuiteAccountId", { length: 64 }),
  /** Client ID for the active account (from DCR or manual override) */
  netsuiteClientId: varchar("netsuiteClientId", { length: 128 }),
  /** Saved NetSuite accounts the user can switch between */
  netsuiteAccounts: jsonb("netsuiteAccounts")
    .$type<NetSuiteAccountEntry[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  /** Per-account MCP tool denylist; omit/empty keeps every tool allowed */
  netsuiteMcpTools: jsonb("netsuiteMcpTools")
    .$type<NetsuiteMcpToolSettings>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  timezone: varchar("timezone", { length: 64 }).default("UTC"),
  searchDomainIds: jsonb("searchDomainIds")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  maxIterations: text("maxIterations").default("10"), // Max reasoning steps (1-20)
  /** Multi-account AI providers; empty blob keeps classic single-provider UI */
  aiProviders: jsonb("aiProviders")
    .$type<AiProviderConfig>()
    .notNull()
    .default(sql`'{"defaultId":null,"providers":[]}'::jsonb`),
  customInstructions: text("customInstructions"),
  /** Oracle/builtin skill ids enabled for chat sessions */
  enabledSkillIds: jsonb("enabledSkillIds")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  customSkills: jsonb("customSkills")
    .$type<CustomSkill[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

export type UserSettings = InferSelectModel<typeof userSettings>;
