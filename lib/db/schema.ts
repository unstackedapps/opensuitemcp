import type { InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  integer,
  json,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type {
  CustomPersona,
  PersonaInterviewState,
} from "../ai/personas/types";
import type { AiProviderConfig } from "../ai/provider-entries";
import type { SearchResourceEntry } from "../ai/search-resources";
import type { ConnectedSkillSource, CustomSkill } from "../ai/skills/catalog";
import type { NetsuiteMcpToolSettings } from "../netsuite/mcp-tool-settings";
import type { AppUsage } from "../usage";

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  name: varchar("name", { length: 128 }),
  password: varchar("password", { length: 64 }),
  lastLoginAt: timestamp("lastLoginAt"),
  status: varchar("status", { length: 16, enum: ["active", "disabled"] })
    .notNull()
    .default("active"),
  mustResetPassword: boolean("mustResetPassword").notNull().default(false),
  onboardingCompletedAt: timestamp("onboardingCompletedAt"),
  onboardingViewedSteps: jsonb("onboardingViewedSteps")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("createdAt").notNull().default(sql`now()`),
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
  /** Per-chat persona; null means Ava */
  personaId: varchar("personaId", { length: 64 }),
  /** When personaId is persona-builder, the custom id being refined (null = create). */
  refiningPersonaId: varchar("refiningPersonaId", { length: 64 }),
  /** Denormalized interview coverage for builder chats. */
  personaInterview: jsonb(
    "personaInterview",
  ).$type<PersonaInterviewState | null>(),
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
  accessToken: text("accessToken").notNull(), // Encrypted AES-256-GCM
  refreshToken: text("refreshToken").notNull(), // Encrypted AES-256-GCM
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
  /** User-managed web search resources (label + URL). */
  searchResources: jsonb("searchResources")
    .$type<SearchResourceEntry[]>()
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
  /** User-connected public GitHub skill packs (slash-invoked) */
  connectedSkillSources: jsonb("connectedSkillSources")
    .$type<ConnectedSkillSource[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  /** Org mode: org-connected pack ids the user has opted out of */
  disabledOrgConnectedSkillSourceIds: jsonb(
    "disabledOrgConnectedSkillSourceIds",
  )
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  /** Default persona for new chats when hidePersonaPicker is true; null = Ava */
  defaultPersonaId: varchar("defaultPersonaId", { length: 64 }),
  /** Skip new-chat persona modal; requires defaultPersonaId when true */
  hidePersonaPicker: boolean("hidePersonaPicker").notNull().default(false),
  /** User-authored personas */
  customPersonas: jsonb("customPersonas")
    .$type<CustomPersona[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

export type UserSettings = InferSelectModel<typeof userSettings>;

export type OrgRole = "owner" | "admin" | "member";

export type OrgLlmProviderModeConfig = {
  label?: string;
  customId?: string;
  baseUrl?: string;
  speedModelId?: string;
  reasoningModelId?: string;
  maxIterations?: string;
};

export const org = pgTable("Org", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: varchar("name", { length: 128 }).notNull(),
  onboardingCompletedAt: timestamp("onboardingCompletedAt"),
  onboardingViewedSteps: jsonb("onboardingViewedSteps")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("createdAt").notNull(),
});

export type Org = InferSelectModel<typeof org>;

export const userRole = pgTable(
  "UserRole",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    orgId: uuid("orgId")
      .notNull()
      .references(() => org.id),
    role: varchar("role", {
      length: 16,
      enum: ["owner", "admin", "member"],
    }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.orgId] }),
  }),
);

export type UserRole = InferSelectModel<typeof userRole>;

export const orgLlmProvider = pgTable("OrgLlmProvider", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  orgId: uuid("orgId")
    .notNull()
    .references(() => org.id),
  provider: varchar("provider", { length: 32 }).notNull(),
  apiKeyEncrypted: text("apiKeyEncrypted"),
  enabled: boolean("enabled").notNull().default(true),
  locked: boolean("locked").notNull().default(false),
  modeConfig: jsonb("modeConfig")
    .$type<OrgLlmProviderModeConfig>()
    .notNull()
    .default(sql`'{}'::jsonb`),
});

export type OrgLlmProvider = InferSelectModel<typeof orgLlmProvider>;

export const userLlmKey = pgTable(
  "UserLlmKey",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    providerId: uuid("providerId")
      .notNull()
      .references(() => orgLlmProvider.id),
    apiKeyEncrypted: text("apiKeyEncrypted").notNull(),
  },
  (table) => ({
    userProviderUnique: uniqueIndex("UserLlmKey_userId_providerId_unique").on(
      table.userId,
      table.providerId,
    ),
  }),
);

export type UserLlmKey = InferSelectModel<typeof userLlmKey>;

export const userLlmProviderAccess = pgTable(
  "UserLlmProviderAccess",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    providerId: uuid("providerId")
      .notNull()
      .references(() => orgLlmProvider.id),
  },
  (table) => ({
    userProviderUnique: uniqueIndex(
      "UserLlmProviderAccess_userId_providerId_unique",
    ).on(table.userId, table.providerId),
  }),
);

export type UserLlmProviderAccess = InferSelectModel<
  typeof userLlmProviderAccess
>;

export const orgNetSuiteAccount = pgTable(
  "OrgNetSuiteAccount",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    orgId: uuid("orgId")
      .notNull()
      .references(() => org.id),
    accountId: varchar("accountId", { length: 64 }).notNull(),
    oauthClientId: varchar("oauthClientId", { length: 128 }),
    redirectUri: varchar("redirectUri", { length: 512 }),
    name: varchar("name", { length: 128 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    locked: boolean("locked").notNull().default(false),
    oidcVerifiedAt: timestamp("oidcVerifiedAt"),
  },
  (table) => ({
    orgAccountUnique: uniqueIndex(
      "OrgNetSuiteAccount_orgId_accountId_unique",
    ).on(table.orgId, table.accountId),
  }),
);

export type OrgNetSuiteAccount = InferSelectModel<typeof orgNetSuiteAccount>;

export const userNetSuiteAccess = pgTable(
  "UserNetSuiteAccess",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    netsuiteAccountId: uuid("netsuiteAccountId")
      .notNull()
      .references(() => orgNetSuiteAccount.id),
  },
  (table) => ({
    userAccountUnique: uniqueIndex(
      "UserNetSuiteAccess_userId_netsuiteAccountId_unique",
    ).on(table.userId, table.netsuiteAccountId),
  }),
);

export type UserNetSuiteAccess = InferSelectModel<typeof userNetSuiteAccess>;

/** Verified NetSuite OIDC emails allowed to sign in as this user (solo). */
export const userOidcLoginEmail = pgTable(
  "UserOidcLoginEmail",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    email: varchar("email", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").notNull().default(sql`now()`),
  },
  (table) => ({
    emailUnique: uniqueIndex("UserOidcLoginEmail_email_unique").on(table.email),
    userEmailUnique: uniqueIndex("UserOidcLoginEmail_userId_email_unique").on(
      table.userId,
      table.email,
    ),
  }),
);

export type UserOidcLoginEmail = InferSelectModel<typeof userOidcLoginEmail>;

/** Per-OIDC-integration email verified via OAuth test (solo sign-in settings). */
export const userOidcConnectionLink = pgTable(
  "UserOidcConnectionLink",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    orgOidcAccountId: uuid("orgOidcAccountId")
      .notNull()
      .references(() => orgNetSuiteAccount.id),
    email: varchar("email", { length: 64 }).notNull(),
    verifiedAt: timestamp("verifiedAt").notNull().default(sql`now()`),
  },
  (table) => ({
    userConnectionUnique: uniqueIndex(
      "UserOidcConnectionLink_userId_orgOidcAccountId_unique",
    ).on(table.userId, table.orgOidcAccountId),
  }),
);

export type UserOidcConnectionLink = InferSelectModel<
  typeof userOidcConnectionLink
>;

export const orgSkill = pgTable(
  "OrgSkill",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    orgId: uuid("orgId")
      .notNull()
      .references(() => org.id),
    skillRef: varchar("skillRef", { length: 128 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    locked: boolean("locked").notNull().default(false),
  },
  (table) => ({
    orgSkillRefUnique: uniqueIndex("OrgSkill_orgId_skillRef_unique").on(
      table.orgId,
      table.skillRef,
    ),
  }),
);

export type OrgSkill = InferSelectModel<typeof orgSkill>;

export const orgPersona = pgTable(
  "OrgPersona",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    orgId: uuid("orgId")
      .notNull()
      .references(() => org.id),
    personaRef: varchar("personaRef", { length: 128 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
  },
  (table) => ({
    orgPersonaRefUnique: uniqueIndex("OrgPersona_orgId_personaRef_unique").on(
      table.orgId,
      table.personaRef,
    ),
  }),
);

export type OrgPersona = InferSelectModel<typeof orgPersona>;

export const userPersonaAccess = pgTable(
  "UserPersonaAccess",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    orgPersonaId: uuid("orgPersonaId")
      .notNull()
      .references(() => orgPersona.id),
  },
  (table) => ({
    userPersonaUnique: uniqueIndex(
      "UserPersonaAccess_userId_orgPersonaId_unique",
    ).on(table.userId, table.orgPersonaId),
  }),
);

export type UserPersonaAccess = InferSelectModel<typeof userPersonaAccess>;

export const orgNetSuiteMcpAccount = pgTable(
  "OrgNetSuiteMcpAccount",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    orgId: uuid("orgId")
      .notNull()
      .references(() => org.id),
    accountId: varchar("accountId", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    oauthClientId: varchar("oauthClientId", { length: 128 }),
    enabled: boolean("enabled").notNull().default(true),
    locked: boolean("locked").notNull().default(false),
    integrationStatus: varchar("integrationStatus", { length: 32 })
      .notNull()
      .default("unknown"),
    integrationVerifiedAt: timestamp("integrationVerifiedAt"),
    integrationError: varchar("integrationError", { length: 512 }),
    mcpDisabledToolNames: jsonb("mcpDisabledToolNames")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (table) => ({
    orgMcpAccountUnique: uniqueIndex(
      "OrgNetSuiteMcpAccount_orgId_accountId_unique",
    ).on(table.orgId, table.accountId),
  }),
);

export type OrgNetSuiteMcpAccount = InferSelectModel<
  typeof orgNetSuiteMcpAccount
>;

export const userNetSuiteMcpAccess = pgTable(
  "UserNetSuiteMcpAccess",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    netsuiteMcpAccountId: uuid("netsuiteMcpAccountId").notNull(),
  },
  (table) => ({
    userMcpAccountUnique: uniqueIndex(
      "UserNetSuiteMcpAccess_userId_netsuiteMcpAccountId_unique",
    ).on(table.userId, table.netsuiteMcpAccountId),
    mcpAccountFk: foreignKey({
      name: "UserNetSuiteMcpAccess_mcpAccountId_OrgNetSuiteMcpAccount_id_fk",
      columns: [table.netsuiteMcpAccountId],
      foreignColumns: [orgNetSuiteMcpAccount.id],
    }),
  }),
);

export type UserNetSuiteMcpAccess = InferSelectModel<
  typeof userNetSuiteMcpAccess
>;

export const orgCustomSkill = pgTable("OrgCustomSkill", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  orgId: uuid("orgId")
    .notNull()
    .references(() => org.id),
  name: varchar("name", { length: 128 }).notNull(),
  content: text("content").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type OrgCustomSkill = InferSelectModel<typeof orgCustomSkill>;

export const orgConnectedSkillSource = pgTable("OrgConnectedSkillSource", {
  id: varchar("id", { length: 64 }).primaryKey().notNull(),
  orgId: uuid("orgId")
    .notNull()
    .references(() => org.id),
  url: varchar("url", { length: 2048 }).notNull(),
  owner: varchar("owner", { length: 128 }).notNull(),
  repo: varchar("repo", { length: 128 }).notNull(),
  ref: varchar("ref", { length: 128 }).notNull(),
  path: varchar("path", { length: 512 }).notNull().default(""),
  label: varchar("label", { length: 512 }).notNull(),
  lastSyncedAt: timestamp("lastSyncedAt").notNull(),
  skillCount: integer("skillCount").notNull().default(0),
  lastError: varchar("lastError", { length: 512 }),
  enabled: boolean("enabled").notNull().default(true),
});

export type OrgConnectedSkillSource = InferSelectModel<
  typeof orgConnectedSkillSource
>;

export const orgSearchResource = pgTable(
  "OrgSearchResource",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    orgId: uuid("orgId")
      .notNull()
      .references(() => org.id),
    label: varchar("label", { length: 128 }).notNull(),
    url: varchar("url", { length: 2048 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    catalogId: varchar("catalogId", { length: 64 }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    orgUrlUnique: uniqueIndex("OrgSearchResource_orgId_url_unique").on(
      table.orgId,
      table.url,
    ),
  }),
);

export type OrgSearchResource = InferSelectModel<typeof orgSearchResource>;

export const orgUserTag = pgTable(
  "OrgUserTag",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    orgId: uuid("orgId")
      .notNull()
      .references(() => org.id),
    name: varchar("name", { length: 64 }).notNull(),
    nameNormalized: varchar("nameNormalized", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    orgNameUnique: uniqueIndex("OrgUserTag_orgId_nameNormalized_unique").on(
      table.orgId,
      table.nameNormalized,
    ),
  }),
);

export type OrgUserTag = InferSelectModel<typeof orgUserTag>;

export const userOrgTag = pgTable(
  "UserOrgTag",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    tagId: uuid("tagId")
      .notNull()
      .references(() => orgUserTag.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.tagId] }),
  }),
);

export type UserOrgTag = InferSelectModel<typeof userOrgTag>;

export const auditLog = pgTable("AuditLog", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  orgId: uuid("orgId")
    .notNull()
    .references(() => org.id),
  actorUserId: uuid("actorUserId").references(() => user.id),
  action: varchar("action", { length: 64 }).notNull(),
  targetType: varchar("targetType", { length: 64 }).notNull(),
  targetId: varchar("targetId", { length: 128 }),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp("createdAt").notNull(),
});

export type AuditLog = InferSelectModel<typeof auditLog>;
