import type { InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
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
import type { SkillModesMap } from "../ai/skills/modes";
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
  summary: text("summary"),
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
  /** Per-skill invocation: auto (inject), slash (composer /), or off */
  skillModes: jsonb("skillModes")
    .$type<SkillModesMap>()
    .notNull()
    .default(sql`'{}'::jsonb`),
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

/**
 * Scopes carried by an MCP API key. `read` covers discovery and non-mutating
 * tool calls; `write` additionally permits tools that change NetSuite data.
 */

/**
 * Per-user credential for the outbound MCP server. External agents present
 * `Authorization: Bearer <token>` and act as the owning user.
 *
 * Only the SHA-256 digest of the key's secret half is stored; `tokenId` is the
 * plaintext lookup half.
 */
export const mcpApiKey = pgTable(
  "McpApiKey",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    /** Org at mint time; null on solo installs. Used for audit and policy. */
    orgId: uuid("orgId").references(() => org.id),
    name: varchar("name", { length: 128 }).notNull(),
    tokenId: varchar("tokenId", { length: 32 }).notNull(),
    tokenHash: text("tokenHash").notNull(),
    /**
     * The key itself, AES-256-GCM under ENCRYPTION_KEY, so its owner can copy
     * it again rather than being shown it once. tokenHash still does the
     * authenticating; this is only ever read back to the person who owns it.
     * Null on keys minted before this existed — those stay copy-once.
     */
    tokenCipher: text("tokenCipher"),
    /** Pins the key to one NetSuite account; null follows the active account. */
    netsuiteAccountId: varchar("netsuiteAccountId", { length: 64 }),
    /**
     * The persona this agent is meant to be, reported on osmcp_whoami so a
     * fresh connection learns its role without being told. Advisory: the agent
     * runs its own model, so adopting the persona is its own act. Null means
     * the agent has no assigned role.
     */
    personaId: varchar("personaId", { length: 128 }),
    lastUsedAt: timestamp("lastUsedAt"),
    /** Last time the secret was replaced on this row; null means never. */
    rotatedAt: timestamp("rotatedAt"),
    expiresAt: timestamp("expiresAt"),
    revokedAt: timestamp("revokedAt"),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    tokenIdIdx: uniqueIndex("McpApiKey_tokenId_key").on(table.tokenId),
    userIdIdx: index("McpApiKey_userId_idx").on(table.userId),
  }),
);

export type McpApiKey = InferSelectModel<typeof mcpApiKey>;

/**
 * Members allowed to use Agent access when the org narrows it to a list.
 * Ignored while the org policy is "all".
 */
export const userAgentAccess = pgTable(
  "UserAgentAccess",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    orgId: uuid("orgId")
      .notNull()
      .references(() => org.id),
  },
  (table) => ({
    userOrgUnique: uniqueIndex("UserAgentAccess_userId_orgId_unique").on(
      table.userId,
      table.orgId,
    ),
  }),
);

/**
 * Org-wide policy for the outbound MCP server. Absent row means the install
 * default applies (disabled until an owner or admin turns it on).
 */
export const orgMcpServerPolicy = pgTable(
  "OrgMcpServerPolicy",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    orgId: uuid("orgId")
      .notNull()
      .references(() => org.id),
    /** Members may mint keys and external agents may connect. */
    enabled: boolean("enabled").notNull().default(false),
    /**
     * "all" lets every member use Agent access once `enabled`; "selected"
     * narrows it to the members listed in UserAgentAccess.
     */
    memberAccess: varchar("memberAccess", { length: 16 })
      .$type<"all" | "selected">()
      .notNull()
      .default("all"),
    maxKeysPerUser: integer("maxKeysPerUser").notNull().default(5),
    createdAt: timestamp("createdAt").notNull(),
    updatedAt: timestamp("updatedAt").notNull(),
  },
  (table) => ({
    orgIdx: uniqueIndex("OrgMcpServerPolicy_orgId_key").on(table.orgId),
  }),
);

export type OrgMcpServerPolicy = InferSelectModel<typeof orgMcpServerPolicy>;

/**
 * An OAuth client that may ask for access to this install.
 *
 * Three things end up in this table, and they differ only in how the row got
 * here:
 *
 *   - `dcr` — the client registered itself at /api/oauth/register. Deprecated
 *     by MCP revision 2026-07-28, still what several shipping clients do.
 *   - `cimd` — a cached Client ID Metadata Document. `clientId` is the https
 *     URL we fetched it from, and the row is a cache of that document rather
 *     than a registration; it is refreshed when `metadataExpiresAt` passes.
 *   - `manual` — a person created it in the App Portal, to paste into a
 *     connector that asks for a client id and secret rather than discovering
 *     one.
 */
export const oauthClient = pgTable(
  "OAuthClient",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    /** Public identifier. An issued `osmcp_client_…`, or a CIMD URL. */
    clientId: varchar("clientId", { length: 512 }).notNull(),
    /** SHA-256 of the secret half. Null for a public client. */
    clientSecretHash: text("clientSecretHash"),
    /**
     * The secret, AES-256-GCM under ENCRYPTION_KEY, so the person who made a
     * manual client can copy it again instead of losing it to a dismissed
     * dialog. Never set for a client that registered itself — nothing would
     * read it back.
     */
    clientSecretCipher: text("clientSecretCipher"),
    clientName: varchar("clientName", { length: 128 }).notNull(),
    clientUri: text("clientUri"),
    logoUri: text("logoUri"),
    redirectUris: jsonb("redirectUris").$type<string[]>().notNull(),
    grantTypes: jsonb("grantTypes").$type<string[]>().notNull(),
    tokenEndpointAuthMethod: varchar("tokenEndpointAuthMethod", { length: 32 })
      .$type<"none" | "client_secret_post" | "client_secret_basic">()
      .notNull(),
    registrationKind: varchar("registrationKind", { length: 16 })
      .$type<"dcr" | "cimd" | "manual">()
      .notNull(),
    softwareId: varchar("softwareId", { length: 128 }),
    /** Who created a manual client. Null for dcr and cimd rows. */
    createdByUserId: uuid("createdByUserId").references(() => user.id),
    orgId: uuid("orgId").references(() => org.id),
    /** CIMD cache bookkeeping; null on every other kind. */
    metadataFetchedAt: timestamp("metadataFetchedAt"),
    metadataExpiresAt: timestamp("metadataExpiresAt"),
    lastUsedAt: timestamp("lastUsedAt"),
    disabledAt: timestamp("disabledAt"),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    clientIdIdx: uniqueIndex("OAuthClient_clientId_key").on(table.clientId),
    createdByIdx: index("OAuthClient_createdByUserId_idx").on(
      table.createdByUserId,
    ),
  }),
);

export type OAuthClient = InferSelectModel<typeof oauthClient>;

/**
 * One authorization code, in flight between the consent screen and the token
 * endpoint.
 *
 * Short-lived and single-use: `consumedAt` is stamped on the first exchange, and
 * a second attempt is treated as theft rather than as a retry. The consent the
 * person gave travels on the row, so the grant is created from what they
 * actually approved rather than from whatever the token request claims.
 */
export const oauthAuthorizationCode = pgTable(
  "OAuthAuthorizationCode",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    tokenId: varchar("tokenId", { length: 32 }).notNull(),
    tokenHash: text("tokenHash").notNull(),
    clientId: varchar("clientId", { length: 512 }).notNull(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    orgId: uuid("orgId").references(() => org.id),
    redirectUri: text("redirectUri").notNull(),
    codeChallenge: varchar("codeChallenge", { length: 128 }).notNull(),
    scope: text("scope").notNull(),
    /** RFC 8707 audience this code may be exchanged for. */
    resource: text("resource").notNull(),
    /** What the person chose on the consent screen. */
    agentName: varchar("agentName", { length: 128 }).notNull(),
    personaId: varchar("personaId", { length: 128 }),
    netsuiteAccountId: varchar("netsuiteAccountId", { length: 64 }),
    expiresAt: timestamp("expiresAt").notNull(),
    consumedAt: timestamp("consumedAt"),
    /**
     * The grant this code created, recorded on the exchange. OAuth 2.1 asks an
     * authorization server to revoke what a replayed code already produced, and
     * without this there is nothing to point at.
     */
    grantId: uuid("grantId"),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    tokenIdIdx: uniqueIndex("OAuthAuthorizationCode_tokenId_key").on(
      table.tokenId,
    ),
    expiresIdx: index("OAuthAuthorizationCode_expiresAt_idx").on(
      table.expiresAt,
    ),
  }),
);

export type OAuthAuthorizationCode = InferSelectModel<
  typeof oauthAuthorizationCode
>;

/**
 * A standing consent: this person let this client act as them.
 *
 * The row is the OAuth counterpart of an McpApiKey, and carries the same three
 * choices — a name, an optional persona, an optional pinned NetSuite account —
 * so an agent that signed in is managed beside one that was handed a key, in
 * one list, with one revoke button. Access tokens come and go against it;
 * revoking the grant ends all of them at once.
 */
export const oauthGrant = pgTable(
  "OAuthGrant",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    orgId: uuid("orgId").references(() => org.id),
    clientId: varchar("clientId", { length: 512 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    /** Pins the grant to one NetSuite account; null follows the active one. */
    netsuiteAccountId: varchar("netsuiteAccountId", { length: 64 }),
    personaId: varchar("personaId", { length: 128 }),
    scope: text("scope").notNull(),
    lastUsedAt: timestamp("lastUsedAt"),
    revokedAt: timestamp("revokedAt"),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    userIdIdx: index("OAuthGrant_userId_idx").on(table.userId),
    clientIdIdx: index("OAuthGrant_clientId_idx").on(table.clientId),
  }),
);

export type OAuthGrant = InferSelectModel<typeof oauthGrant>;

/**
 * An access or refresh token issued against a grant.
 *
 * Opaque and hashed, like McpApiKey, so revocation takes effect on the next
 * call rather than whenever a JWT would have expired.
 *
 * Refresh tokens rotate: exchanging one stamps `consumedAt` and issues a
 * successor carrying `rotatedFromId`. Presenting a consumed refresh token means
 * either a replay or a client that lost the response, and neither is safe to
 * serve, so it revokes the whole grant.
 */
export const oauthToken = pgTable(
  "OAuthToken",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    grantId: uuid("grantId")
      .notNull()
      .references(() => oauthGrant.id),
    kind: varchar("kind", { length: 16 })
      .$type<"access" | "refresh">()
      .notNull(),
    tokenId: varchar("tokenId", { length: 32 }).notNull(),
    tokenHash: text("tokenHash").notNull(),
    /** The refresh token this one replaced, for reuse detection. */
    rotatedFromId: uuid("rotatedFromId"),
    expiresAt: timestamp("expiresAt").notNull(),
    consumedAt: timestamp("consumedAt"),
    revokedAt: timestamp("revokedAt"),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    tokenIdIdx: uniqueIndex("OAuthToken_tokenId_key").on(table.tokenId),
    grantIdx: index("OAuthToken_grantId_idx").on(table.grantId),
    expiresIdx: index("OAuthToken_expiresAt_idx").on(table.expiresAt),
  }),
);

export type OAuthToken = InferSelectModel<typeof oauthToken>;
