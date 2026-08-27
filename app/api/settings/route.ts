import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  AVA_PERSONA_ID,
  isDefaultablePersonaId,
  isValidPersonaId,
  listPersonasForClient,
  normalizeCustomPersonas,
} from "@/lib/ai/personas/catalog";
import {
  ensureSeededProviderConfig,
  legacyColumnsFromConfig,
  parseAiProviderConfig,
} from "@/lib/ai/provider-entries";
import {
  decryptProviderConfig,
  persistProviderConfig,
} from "@/lib/ai/provider-settings";
import {
  assertSearchResourceList,
  enabledSearchResourceIds,
  hydrateSearchResources,
  mergeOrgSearchResourcesForUser,
  overlayUserSearchResourceEnabled,
  type SearchResourceEntry,
} from "@/lib/ai/search-resources";
import { normalizeUserSkillSettings } from "@/lib/ai/skills/catalog";
import { getUserSettings, upsertUserSettings } from "@/lib/db/queries";
import { decrypt, encrypt } from "@/lib/encryption";
import {
  type NetSuiteAccountEntry,
  normalizeNetSuiteAccountId,
  resolveNetSuiteAccounts,
} from "@/lib/netsuite/accounts";
import {
  mergeNetsuiteMcpToolSettings,
  parseNetsuiteMcpToolSettings,
  withMcpToolDisabledNames,
} from "@/lib/netsuite/mcp-tool-settings";
import {
  assertOrgPersonaAllowed,
  buildOrgAwarePersonaList,
  buildOrgAwareSkillSettings,
  normalizeDisabledOrgConnectedSkillSourceIds,
  validateOrgMcpToolSettingsPatch,
  validateOrgNetSuiteAccountsPatch,
  validateOrgProviderSettingsPatch,
  validateOrgSkillSettingsPatch,
} from "@/lib/org/enforcement";
import { getInstallMode, isOrgInstallMode } from "@/lib/org/install-config";
import { syncUserLlmProvidersWithOrg } from "@/lib/org/llm-user-sync";
import {
  enforceOrgNetSuiteMcpAccountLabels,
  syncUserNetSuiteMcpAccountsWithOrg,
} from "@/lib/org/netsuite-mcp-user-sync";
import {
  listOrgSearchResources,
  orgSearchResourceToClient,
} from "@/lib/org/search-resources";

const aiProviderSchema = z.enum(["google", "anthropic", "openai"]);
const aiProviderTypeSchema = z.enum([
  "google",
  "anthropic",
  "openai",
  "custom",
]);

const aiProviderEntrySchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(64),
  type: aiProviderTypeSchema,
  apiKey: z.string().max(4096).optional().nullable(),
  maxIterations: z.string().max(8).optional(),
  baseUrl: z.string().max(512).optional(),
  speedModelId: z.string().max(256).optional(),
  reasoningModelId: z.string().max(256).optional(),
});

const aiProviderConfigSchema = z.object({
  defaultId: z.string().max(64).nullable(),
  providers: z.array(aiProviderEntrySchema).max(10),
});

const netsuiteAccountSchema = z.object({
  accountId: z.string().min(1).max(64),
  label: z.string().max(64),
  clientId: z.string().max(128).optional().nullable(),
});

const netsuiteMcpToolsSchema = z.object({
  byAccount: z
    .record(
      z.string().max(64),
      z.object({
        disabledNames: z.array(z.string().min(1).max(256)).max(256),
      }),
    )
    .optional()
    .default({}),
});

const customSkillSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().max(200),
  content: z.string().max(32_000),
  updatedAt: z.string().optional(),
  enabled: z.boolean().optional(),
});

const customPersonaSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().max(200),
  shortName: z.string().max(40).optional(),
  primaryRole: z.string().max(300).optional(),
  content: z.string().max(32_000),
  updatedAt: z.string().optional(),
});

const settingsSchema = z.object({
  googleApiKey: z.string().optional().nullable(),
  anthropicApiKey: z.string().optional().nullable(),
  openaiApiKey: z.string().optional().nullable(),
  aiProvider: aiProviderSchema.optional().nullable(),
  netsuiteAccountId: z.string().max(64).optional().nullable(),
  netsuiteClientId: z.string().max(128).optional().nullable(),
  netsuiteAccounts: z
    .array(netsuiteAccountSchema)
    .max(20)
    .optional()
    .nullable(),
  timezone: z.string().max(64).optional().nullable(),
  searchDomainIds: z.array(z.string()).max(16).optional().nullable(),
  searchResources: z
    .array(
      z.object({
        id: z.string().min(1).max(128),
        label: z.string().min(1).max(128),
        url: z.string().min(1).max(2048),
        enabled: z.boolean().optional(),
        catalogId: z.string().max(64).nullable().optional(),
      }),
    )
    .max(16)
    .optional()
    .nullable(),
  maxIterations: z
    .string()
    .regex(/^\d+$/)
    .transform((val) => {
      const num = Number.parseInt(val, 10);
      // Clamp between 1 and 20
      return Math.max(1, Math.min(20, num)).toString();
    })
    .optional()
    .nullable(),
  customInstructions: z.string().max(32_000).optional().nullable(),
  enabledSkillIds: z.array(z.string().max(128)).max(128).optional().nullable(),
  customSkills: z.array(customSkillSchema).max(32).optional().nullable(),
  disabledOrgConnectedSkillSourceIds: z
    .array(z.string().max(64))
    .max(64)
    .optional()
    .nullable(),
  aiProviders: aiProviderConfigSchema.optional().nullable(),
  netsuiteMcpTools: netsuiteMcpToolsSchema.optional().nullable(),
  defaultPersonaId: z.string().max(64).optional().nullable(),
  hidePersonaPicker: z.boolean().optional().nullable(),
  customPersonas: z.array(customPersonaSchema).max(32).optional().nullable(),
});

function normalizeAiProvider(
  value: string | null | undefined,
): "google" | "anthropic" | "openai" {
  if (value === "google" || value === "anthropic" || value === "openai") {
    return value;
  }
  return "google";
}

function resolveSkillSettings(
  settings: Awaited<ReturnType<typeof getUserSettings>>,
) {
  return normalizeUserSkillSettings(
    settings
      ? {
          enabledSkillIds: settings.enabledSkillIds ?? [],
          customSkills: settings.customSkills ?? [],
          connectedSkillSources: settings.connectedSkillSources ?? [],
        }
      : null,
    settings?.customInstructions,
  );
}

function shouldPersistLegacySkillMigration(
  settings: NonNullable<Awaited<ReturnType<typeof getUserSettings>>>,
  normalized: ReturnType<typeof normalizeUserSkillSettings>,
): boolean {
  const legacy = settings.customInstructions?.trim();
  if (!legacy) {
    return false;
  }
  if (
    settings.customSkills?.some(
      (skill) => skill.id === "migrated-custom-instructions",
    )
  ) {
    return false;
  }
  return normalized.customSkills.some(
    (skill) => skill.id === "migrated-custom-instructions",
  );
}

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const installMode = getInstallMode();
    const settings = await getUserSettings({ userId: session.user.id });

    console.log("[Settings API] Raw settings from DB:", {
      hasGoogleKey: !!settings?.googleApiKey,
      hasAnthropicKey: !!settings?.anthropicApiKey,
      hasOpenAIKey: !!settings?.openaiApiKey,
      aiProvider: settings?.aiProvider,
    });

    if (!settings) {
      const emptySkills = resolveSkillSettings(null);
      const seededProviderConfig = ensureSeededProviderConfig(null);

      let aiProvidersForClient = seededProviderConfig;
      let netsuiteAccountsForClient: NetSuiteAccountEntry[] = [];
      let enabledSkillIds = emptySkills.enabledSkillIds;
      let customSkills = emptySkills.customSkills;
      let connectedSkillSources = emptySkills.connectedSkillSources;
      let searchResourcesForClient = hydrateSearchResources({});
      let orgSearchPolicy = { managedByOrg: false };
      let orgMcpPolicy = {
        managedByOrg: false,
        allowFreeAdd: true,
        lockedAccountIds: [] as string[],
        addableAccounts: [] as NetSuiteAccountEntry[],
      };
      let orgLlmPolicy = { managedByOrg: false };
      const orgPersonasPolicy =
        isOrgInstallMode() && session.user.orgId
          ? { managedByOrg: true }
          : undefined;
      const orgMcpToolsPolicy =
        isOrgInstallMode() && session.user.orgId
          ? { managedByOrg: true }
          : undefined;
      let personasForClient = listPersonasForClient([]);

      if (isOrgInstallMode() && session.user.orgId) {
        const llmSync = await syncUserLlmProvidersWithOrg({
          orgId: session.user.orgId,
          userId: session.user.id,
          userConfig: seededProviderConfig,
        });
        aiProvidersForClient = llmSync.config;
        orgLlmPolicy = llmSync.policy;

        if (llmSync.configChanged) {
          try {
            await upsertUserSettings({
              userId: session.user.id,
              aiProviders: {
                defaultId: llmSync.config.defaultId,
                providers: llmSync.config.providers.map((entry) => ({
                  ...entry,
                  apiKey: null,
                })),
              },
            });
          } catch (error) {
            console.warn(
              "[Settings API] Failed to persist org LLM provider sync:",
              error,
            );
          }
        }

        const mcpSync = await syncUserNetSuiteMcpAccountsWithOrg({
          orgId: session.user.orgId,
          userId: session.user.id,
          userAccounts: [],
        });
        netsuiteAccountsForClient = mcpSync.accounts;
        orgMcpPolicy = mcpSync.policy;

        if (mcpSync.accountsChanged) {
          const activeId = mcpSync.accounts[0]?.accountId ?? null;
          const activeAccount = mcpSync.accounts.find(
            (account) => account.accountId === activeId,
          );
          try {
            await upsertUserSettings({
              userId: session.user.id,
              netsuiteAccounts: mcpSync.accounts,
              netsuiteAccountId: activeId,
              netsuiteClientId: activeAccount?.clientId ?? null,
            });
          } catch (error) {
            console.warn(
              "[Settings API] Failed to persist org MCP account sync:",
              error,
            );
          }
        }

        const orgSkillSettings = await buildOrgAwareSkillSettings({
          orgId: session.user.orgId,
          enabledSkillIds,
          customSkills,
          connectedSkillSources,
          disabledOrgConnectedSkillSourceIds: [],
        });
        enabledSkillIds = orgSkillSettings.enabledSkillIds;
        customSkills = orgSkillSettings.customSkills;
        connectedSkillSources = orgSkillSettings.connectedSkillSources;

        personasForClient = await buildOrgAwarePersonaList(
          session.user.orgId,
          session.user.id,
          [],
        );

        const orgSearchRows = await listOrgSearchResources(session.user.orgId);
        searchResourcesForClient = mergeOrgSearchResourcesForUser({
          orgResources: orgSearchRows.map(orgSearchResourceToClient),
          userResources: [],
        });
        orgSearchPolicy = { managedByOrg: true };
      }

      const activeAccountIdForClient =
        netsuiteAccountsForClient[0]?.accountId ?? null;
      const activeAccountForClient = netsuiteAccountsForClient.find(
        (account) => account.accountId === activeAccountIdForClient,
      );

      return NextResponse.json({
        googleApiKey: null,
        anthropicApiKey: null,
        openaiApiKey: null,
        aiProvider: "google",
        netsuiteAccountId: activeAccountIdForClient,
        netsuiteClientId: activeAccountForClient?.clientId ?? null,
        netsuiteAccounts: netsuiteAccountsForClient,
        timezone: "UTC",
        searchDomainIds: enabledSearchResourceIds(searchResourcesForClient),
        searchResources: searchResourcesForClient,
        orgSearchPolicy,
        maxIterations: "10",
        customInstructions: null,
        enabledSkillIds,
        customSkills,
        connectedSkillSources,
        aiProviders: aiProvidersForClient,
        netsuiteMcpTools: { byAccount: {} },
        defaultPersonaId: null,
        hidePersonaPicker: false,
        customPersonas: [],
        personas: personasForClient,
        orgMcpPolicy,
        orgLlmPolicy,
        orgPersonasPolicy,
        orgMcpToolsPolicy,
        orgSkillsPolicy:
          isOrgInstallMode() && session.user.orgId
            ? { managedByOrg: true }
            : undefined,
        installMode,
      });
    }

    // Decrypt API keys if present
    let decryptedGoogleKey: string | null = null;
    if (settings.googleApiKey) {
      try {
        decryptedGoogleKey = decrypt(settings.googleApiKey);
        console.log("[Settings API] Successfully decrypted Google key");
      } catch (error) {
        console.error(
          "[Settings API] Error decrypting Google API key on GET:",
          error,
        );
        decryptedGoogleKey = null;
      }
    } else {
      console.log("[Settings API] No Google key in DB");
    }

    let decryptedAnthropicKey: string | null = null;
    if (settings.anthropicApiKey) {
      try {
        decryptedAnthropicKey = decrypt(settings.anthropicApiKey);
        console.log("[Settings API] Successfully decrypted Anthropic key");
      } catch (error) {
        console.error(
          "[Settings API] Error decrypting Anthropic API key on GET:",
          error,
        );
        decryptedAnthropicKey = null;
      }
    } else {
      console.log("[Settings API] No Anthropic key in DB");
    }

    let decryptedOpenAIKey: string | null = null;
    if (settings.openaiApiKey) {
      try {
        decryptedOpenAIKey = decrypt(settings.openaiApiKey);
        console.log("[Settings API] Successfully decrypted OpenAI key");
      } catch (error) {
        console.error(
          "[Settings API] Error decrypting OpenAI API key on GET:",
          error,
        );
        decryptedOpenAIKey = null;
      }
    } else {
      console.log("[Settings API] No OpenAI key in DB");
    }

    const provider = normalizeAiProvider(settings.aiProvider);
    const netsuiteAccounts = resolveNetSuiteAccounts(settings);

    const skillSettings = resolveSkillSettings(settings);

    let decryptedGoogleKeyForClient = decryptedGoogleKey;
    let decryptedAnthropicKeyForClient = decryptedAnthropicKey;
    let decryptedOpenAIKeyForClient = decryptedOpenAIKey;

    const legacyForProviders = {
      googleApiKey: decryptedGoogleKey,
      anthropicApiKey: decryptedAnthropicKey,
      openaiApiKey: decryptedOpenAIKey,
      aiProvider: provider,
      maxIterations: settings.maxIterations,
    };
    const decryptedProviderConfig = decryptProviderConfig(settings.aiProviders);
    const seededProviderConfig = ensureSeededProviderConfig(
      decryptedProviderConfig,
      legacyForProviders,
    );

    if (
      JSON.stringify(seededProviderConfig) !==
      JSON.stringify(decryptedProviderConfig)
    ) {
      try {
        const persistedProviders = await persistProviderConfig({
          incoming: seededProviderConfig,
          existingConfig: parseAiProviderConfig(settings.aiProviders),
          legacy: {
            googleApiKey: settings.googleApiKey,
            anthropicApiKey: settings.anthropicApiKey,
            openaiApiKey: settings.openaiApiKey,
            aiProvider: settings.aiProvider,
            maxIterations: settings.maxIterations,
          },
        });
        await upsertUserSettings({
          userId: session.user.id,
          aiProviders: persistedProviders,
        });
      } catch (error) {
        console.warn(
          "[Settings API] Failed to persist seeded AI provider migration:",
          error,
        );
      }
    }

    if (shouldPersistLegacySkillMigration(settings, skillSettings)) {
      try {
        await upsertUserSettings({
          userId: session.user.id,
          enabledSkillIds: skillSettings.enabledSkillIds,
          customSkills: skillSettings.customSkills,
        });
      } catch (error) {
        console.warn(
          "[Settings API] Failed to persist legacy skill migration:",
          error,
        );
      }
    }

    let aiProvidersForClient = seededProviderConfig;
    let netsuiteAccountsForClient = netsuiteAccounts;
    let enabledSkillIdsForClient = skillSettings.enabledSkillIds;

    let orgMcpPolicy = {
      managedByOrg: false,
      allowFreeAdd: true,
      lockedAccountIds: [] as string[],
      addableAccounts: [] as NetSuiteAccountEntry[],
    };
    let orgLlmPolicy = { managedByOrg: false };
    let searchResourcesForClient = hydrateSearchResources({
      searchResources: settings.searchResources,
      searchDomainIds: settings.searchDomainIds,
    });
    let orgSearchPolicy = { managedByOrg: false };
    const orgPersonasPolicy =
      isOrgInstallMode() && session.user.orgId
        ? { managedByOrg: true }
        : undefined;
    const orgMcpToolsPolicy =
      isOrgInstallMode() && session.user.orgId
        ? { managedByOrg: true }
        : undefined;
    let personasForClient = listPersonasForClient(
      normalizeCustomPersonas(settings.customPersonas),
    );

    if (isOrgInstallMode() && session.user.orgId) {
      const llmSync = await syncUserLlmProvidersWithOrg({
        orgId: session.user.orgId,
        userId: session.user.id,
        userConfig: seededProviderConfig,
      });
      aiProvidersForClient = llmSync.config;
      orgLlmPolicy = llmSync.policy;

      if (llmSync.configChanged) {
        try {
          await upsertUserSettings({
            userId: session.user.id,
            aiProviders: {
              defaultId: llmSync.config.defaultId,
              providers: llmSync.config.providers.map((entry) => ({
                ...entry,
                apiKey: null,
              })),
            },
          });
        } catch (error) {
          console.warn(
            "[Settings API] Failed to persist org LLM provider sync:",
            error,
          );
        }
      }

      decryptedGoogleKeyForClient = null;
      decryptedAnthropicKeyForClient = null;
      decryptedOpenAIKeyForClient = null;

      const mcpSync = await syncUserNetSuiteMcpAccountsWithOrg({
        orgId: session.user.orgId,
        userId: session.user.id,
        userAccounts: netsuiteAccounts,
      });
      netsuiteAccountsForClient = mcpSync.accounts;
      orgMcpPolicy = mcpSync.policy;

      if (mcpSync.accountsChanged) {
        const activeId = settings.netsuiteAccountId
          ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
          : (mcpSync.accounts[0]?.accountId ?? null);
        const activeAccount = mcpSync.accounts.find(
          (account) => account.accountId === activeId,
        );
        try {
          await upsertUserSettings({
            userId: session.user.id,
            netsuiteAccounts: mcpSync.accounts,
            netsuiteAccountId: activeId,
            netsuiteClientId:
              activeAccount?.clientId ?? settings.netsuiteClientId ?? null,
          });
        } catch (error) {
          console.warn(
            "[Settings API] Failed to persist org MCP account sync:",
            error,
          );
        }
      }

      const orgSkillSettings = await buildOrgAwareSkillSettings({
        orgId: session.user.orgId,
        enabledSkillIds: skillSettings.enabledSkillIds,
        customSkills: skillSettings.customSkills,
        connectedSkillSources: skillSettings.connectedSkillSources,
        disabledOrgConnectedSkillSourceIds:
          normalizeDisabledOrgConnectedSkillSourceIds(
            settings.disabledOrgConnectedSkillSourceIds,
          ),
      });
      enabledSkillIdsForClient = orgSkillSettings.enabledSkillIds;
      skillSettings.customSkills = orgSkillSettings.customSkills;
      skillSettings.connectedSkillSources =
        orgSkillSettings.connectedSkillSources;

      personasForClient = await buildOrgAwarePersonaList(
        session.user.orgId,
        session.user.id,
        normalizeCustomPersonas(settings.customPersonas),
      );

      const orgSearchRows = await listOrgSearchResources(session.user.orgId);
      searchResourcesForClient = mergeOrgSearchResourcesForUser({
        orgResources: orgSearchRows.map(orgSearchResourceToClient),
        userResources: settings.searchResources,
      });
      orgSearchPolicy = { managedByOrg: true };
    }

    const activeAccountIdForClient = settings.netsuiteAccountId
      ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
      : (netsuiteAccountsForClient[0]?.accountId ?? null);
    const activeAccountForClient = netsuiteAccountsForClient.find(
      (account) => account.accountId === activeAccountIdForClient,
    );

    const response = {
      googleApiKey: decryptedGoogleKeyForClient,
      anthropicApiKey: decryptedAnthropicKeyForClient,
      openaiApiKey: decryptedOpenAIKeyForClient,
      aiProvider: provider,
      netsuiteAccountId: activeAccountIdForClient,
      netsuiteClientId:
        activeAccountForClient?.clientId ?? settings.netsuiteClientId ?? null,
      netsuiteAccounts: netsuiteAccountsForClient,
      timezone: settings.timezone ?? "UTC",
      searchDomainIds: enabledSearchResourceIds(searchResourcesForClient),
      searchResources: searchResourcesForClient,
      orgSearchPolicy,
      maxIterations: settings.maxIterations ?? "10",
      customInstructions: settings.customInstructions ?? null,
      enabledSkillIds: enabledSkillIdsForClient,
      customSkills: skillSettings.customSkills,
      connectedSkillSources: skillSettings.connectedSkillSources,
      aiProviders: aiProvidersForClient,
      netsuiteMcpTools: parseNetsuiteMcpToolSettings(settings.netsuiteMcpTools),
      defaultPersonaId: settings.defaultPersonaId ?? null,
      hidePersonaPicker: settings.hidePersonaPicker ?? false,
      customPersonas: normalizeCustomPersonas(settings.customPersonas),
      personas: personasForClient,
      orgMcpPolicy,
      orgLlmPolicy,
      orgPersonasPolicy,
      orgMcpToolsPolicy,
      orgSkillsPolicy:
        isOrgInstallMode() && session.user.orgId
          ? { managedByOrg: true }
          : undefined,
      installMode,
    };

    console.log("[Settings API] Sending response:", {
      hasGoogleKey: !!response.googleApiKey,
      hasAnthropicKey: !!response.anthropicApiKey,
      hasOpenAIKey: !!response.openaiApiKey,
      aiProvider: response.aiProvider,
      googleKeyLength: response.googleApiKey?.length ?? 0,
      anthropicKeyLength: response.anthropicApiKey?.length ?? 0,
      openaiKeyLength: response.openaiApiKey?.length ?? 0,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Settings] Error fetching settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = settingsSchema.partial().parse(body);

    // Get existing settings to preserve values not being updated
    const existing = await getUserSettings({ userId: session.user.id });

    // Encrypt Google API key if provided
    let encryptedGoogleKey: string | null | undefined;
    if (validated.googleApiKey !== undefined) {
      const trimmedKey = validated.googleApiKey?.trim();
      if (trimmedKey) {
        try {
          encryptedGoogleKey = encrypt(trimmedKey);
        } catch (error) {
          console.error("[Settings] Error encrypting Google API key:", error);
          return NextResponse.json(
            {
              error:
                "Failed to encrypt Google API key. Please check ENCRYPTION_KEY environment variable.",
            },
            { status: 500 },
          );
        }
      } else {
        encryptedGoogleKey = null;
      }
    } else if (existing?.googleApiKey) {
      encryptedGoogleKey = existing.googleApiKey;
    }

    // Encrypt Anthropic API key if provided
    let encryptedAnthropicKey: string | null | undefined;
    if (validated.anthropicApiKey !== undefined) {
      const trimmedKey = validated.anthropicApiKey?.trim();
      if (trimmedKey) {
        try {
          encryptedAnthropicKey = encrypt(trimmedKey);
        } catch (error) {
          console.error(
            "[Settings] Error encrypting Anthropic API key:",
            error,
          );
          return NextResponse.json(
            {
              error:
                "Failed to encrypt Anthropic API key. Please check ENCRYPTION_KEY environment variable.",
            },
            { status: 500 },
          );
        }
      } else {
        encryptedAnthropicKey = null;
      }
    } else if (existing?.anthropicApiKey) {
      encryptedAnthropicKey = existing.anthropicApiKey;
    }

    // Encrypt OpenAI API key if provided
    let encryptedOpenAIKey: string | null | undefined;
    if (validated.openaiApiKey !== undefined) {
      const trimmedKey = validated.openaiApiKey?.trim();
      if (trimmedKey) {
        try {
          encryptedOpenAIKey = encrypt(trimmedKey);
        } catch (error) {
          console.error("[Settings] Error encrypting OpenAI API key:", error);
          return NextResponse.json(
            {
              error:
                "Failed to encrypt OpenAI API key. Please check ENCRYPTION_KEY environment variable.",
            },
            { status: 500 },
          );
        }
      } else {
        encryptedOpenAIKey = null;
      }
    } else if (existing?.openaiApiKey) {
      encryptedOpenAIKey = existing.openaiApiKey;
    }

    const nextProvider =
      validated.aiProvider !== undefined
        ? normalizeAiProvider(validated.aiProvider)
        : undefined;

    let nextAccounts =
      validated.netsuiteAccounts !== undefined
        ? resolveNetSuiteAccounts({
            netsuiteAccounts: validated.netsuiteAccounts ?? [],
          })
        : undefined;

    let nextAccountId =
      validated.netsuiteAccountId !== undefined
        ? validated.netsuiteAccountId
          ? normalizeNetSuiteAccountId(validated.netsuiteAccountId)
          : null
        : undefined;

    let nextClientId =
      validated.netsuiteClientId !== undefined
        ? validated.netsuiteClientId
        : undefined;

    if (nextAccounts) {
      if (
        nextAccountId &&
        !nextAccounts.some((account) => account.accountId === nextAccountId)
      ) {
        nextAccountId = nextAccounts[0]?.accountId ?? null;
      }
      if (!nextAccountId && nextAccounts[0]) {
        nextAccountId = nextAccounts[0].accountId;
      }
      const active = nextAccounts.find(
        (account) => account.accountId === nextAccountId,
      );
      if (active && nextClientId === undefined) {
        nextClientId = active.clientId ?? null;
      }
    } else if (nextAccountId && nextClientId === undefined) {
      const active = resolveNetSuiteAccounts(existing ?? {}).find(
        (account) => account.accountId === nextAccountId,
      );
      if (active) {
        nextClientId = active.clientId ?? null;
      }
    }

    let nextCustomSkills =
      validated.customSkills !== undefined
        ? normalizeUserSkillSettings({
            enabledSkillIds:
              validated.enabledSkillIds ?? existing?.enabledSkillIds ?? [],
            customSkills: validated.customSkills ?? [],
          }).customSkills
        : undefined;

    let nextEnabledSkillIds =
      validated.enabledSkillIds !== undefined
        ? normalizeUserSkillSettings({
            enabledSkillIds: validated.enabledSkillIds ?? [],
            customSkills: nextCustomSkills ?? existing?.customSkills ?? [],
          }).enabledSkillIds
        : undefined;

    let nextDisabledOrgConnectedSkillSourceIds =
      validated.disabledOrgConnectedSkillSourceIds !== undefined
        ? normalizeDisabledOrgConnectedSkillSourceIds(
            validated.disabledOrgConnectedSkillSourceIds,
          )
        : undefined;

    const nextCustomPersonas =
      validated.customPersonas !== undefined
        ? normalizeCustomPersonas(validated.customPersonas)
        : undefined;

    let nextDefaultPersonaId =
      validated.defaultPersonaId !== undefined
        ? validated.defaultPersonaId?.trim() || null
        : undefined;
    const nextHidePersonaPicker =
      validated.hidePersonaPicker !== undefined
        ? Boolean(validated.hidePersonaPicker)
        : undefined;

    const personasForValidation =
      nextCustomPersonas ?? normalizeCustomPersonas(existing?.customPersonas);

    // If deleting a custom that was the default, fall back to Ava
    if (nextCustomPersonas !== undefined && existing?.defaultPersonaId) {
      const def = existing.defaultPersonaId;
      if (
        def !== AVA_PERSONA_ID &&
        !isValidPersonaId(def, nextCustomPersonas)
      ) {
        nextDefaultPersonaId = null;
      }
    }

    const effectiveHide =
      nextHidePersonaPicker !== undefined
        ? nextHidePersonaPicker
        : (existing?.hidePersonaPicker ?? false);
    const effectiveDefault =
      nextDefaultPersonaId !== undefined
        ? nextDefaultPersonaId
        : (existing?.defaultPersonaId ?? null);

    if (effectiveHide) {
      const defId = effectiveDefault?.trim() || AVA_PERSONA_ID;
      if (!isDefaultablePersonaId(defId, personasForValidation)) {
        return NextResponse.json(
          {
            error:
              "A valid default persona is required when the persona picker is hidden",
          },
          { status: 400 },
        );
      }
      if (nextDefaultPersonaId === undefined && !effectiveDefault) {
        nextDefaultPersonaId = AVA_PERSONA_ID;
      }
    }

    if (
      nextDefaultPersonaId !== undefined &&
      nextDefaultPersonaId !== null &&
      !isDefaultablePersonaId(nextDefaultPersonaId, personasForValidation)
    ) {
      return NextResponse.json(
        { error: "Unknown default persona" },
        { status: 400 },
      );
    }

    if (nextDefaultPersonaId === AVA_PERSONA_ID) {
      nextDefaultPersonaId = null;
    }

    if (isOrgInstallMode() && session.user.orgId && nextDefaultPersonaId) {
      try {
        await assertOrgPersonaAllowed({
          orgId: session.user.orgId,
          userId: session.user.id,
          personaId: nextDefaultPersonaId,
        });
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Default persona is not allowed for your organization.",
          },
          { status: 400 },
        );
      }
    }

    let nextNetsuiteMcpTools =
      validated.netsuiteMcpTools !== undefined
        ? mergeNetsuiteMcpToolSettings(
            existing?.netsuiteMcpTools,
            validated.netsuiteMcpTools,
          )
        : undefined;

    if (isOrgInstallMode() && session.user.orgId && nextNetsuiteMcpTools) {
      for (const [accountId, entry] of Object.entries(
        nextNetsuiteMcpTools.byAccount,
      )) {
        const clamped = await validateOrgMcpToolSettingsPatch({
          orgId: session.user.orgId,
          accountId,
          incomingDisabledNames: entry.disabledNames,
        });
        nextNetsuiteMcpTools = withMcpToolDisabledNames(
          nextNetsuiteMcpTools,
          accountId,
          clamped,
        );
      }
    }

    let nextAiProviders:
      | Awaited<ReturnType<typeof persistProviderConfig>>
      | undefined;
    if (validated.aiProviders !== undefined) {
      try {
        nextAiProviders = await persistProviderConfig({
          incoming: validated.aiProviders,
          existingConfig: parseAiProviderConfig(existing?.aiProviders),
          legacy: {
            googleApiKey: encryptedGoogleKey || existing?.googleApiKey,
            anthropicApiKey: encryptedAnthropicKey || existing?.anthropicApiKey,
            openaiApiKey: encryptedOpenAIKey || existing?.openaiApiKey,
            aiProvider: nextProvider ?? existing?.aiProvider,
            maxIterations: validated.maxIterations ?? existing?.maxIterations,
          },
        });
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Invalid AI provider settings",
          },
          { status: 400 },
        );
      }
    }

    let nextGoogleKey = encryptedGoogleKey;
    let nextAnthropicKey = encryptedAnthropicKey;
    let nextOpenAIKey = encryptedOpenAIKey;
    let nextLegacyProvider = nextProvider;
    let nextMaxIterations = validated.maxIterations;

    if (nextAiProviders && nextAiProviders.providers.length > 0) {
      const legacyFromList = legacyColumnsFromConfig(nextAiProviders);
      nextGoogleKey = legacyFromList.googleApiKey;
      nextAnthropicKey = legacyFromList.anthropicApiKey;
      nextOpenAIKey = legacyFromList.openaiApiKey;
      nextLegacyProvider = legacyFromList.aiProvider;
      nextMaxIterations = legacyFromList.maxIterations;
    }

    if (isOrgInstallMode() && session.user.orgId) {
      if (nextAccounts) {
        try {
          await validateOrgNetSuiteAccountsPatch({
            orgId: session.user.orgId,
            userId: session.user.id,
            accounts: nextAccounts,
          });
          nextAccounts = await enforceOrgNetSuiteMcpAccountLabels({
            orgId: session.user.orgId,
            userId: session.user.id,
            accounts: nextAccounts,
          });
        } catch (error) {
          return NextResponse.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "NetSuite account not allowed.",
            },
            { status: 400 },
          );
        }
      }

      if (
        nextEnabledSkillIds ||
        nextCustomSkills !== undefined ||
        nextDisabledOrgConnectedSkillSourceIds !== undefined
      ) {
        try {
          const overlaid = await validateOrgSkillSettingsPatch({
            orgId: session.user.orgId,
            nextEnabledSkillIds: nextEnabledSkillIds ?? undefined,
            nextCustomSkills: nextCustomSkills ?? undefined,
            nextDisabledOrgConnectedSkillSourceIds:
              nextDisabledOrgConnectedSkillSourceIds ?? undefined,
          });
          if (overlaid.enabledSkillIds !== undefined) {
            nextEnabledSkillIds = overlaid.enabledSkillIds;
          }
          if (overlaid.customSkills !== undefined) {
            nextCustomSkills = overlaid.customSkills;
          }
          if (overlaid.disabledOrgConnectedSkillSourceIds !== undefined) {
            nextDisabledOrgConnectedSkillSourceIds =
              overlaid.disabledOrgConnectedSkillSourceIds;
          }
        } catch (error) {
          return NextResponse.json(
            {
              error:
                error instanceof Error ? error.message : "Skill not allowed.",
            },
            { status: 400 },
          );
        }
      }

      if (nextAiProviders) {
        try {
          nextAiProviders = await validateOrgProviderSettingsPatch({
            orgId: session.user.orgId,
            userId: session.user.id,
            existing: parseAiProviderConfig(existing?.aiProviders),
            incoming: nextAiProviders,
            legacyKeys: {
              googleApiKey: encryptedGoogleKey,
              anthropicApiKey: encryptedAnthropicKey,
              openaiApiKey: encryptedOpenAIKey,
            },
          });
        } catch (error) {
          return NextResponse.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Provider settings not allowed.",
            },
            { status: 400 },
          );
        }
      }

      if (
        validated.googleApiKey !== undefined ||
        validated.anthropicApiKey !== undefined ||
        validated.openaiApiKey !== undefined
      ) {
        return NextResponse.json(
          {
            error:
              "LLM provider API keys are managed by your organization administrator.",
          },
          { status: 400 },
        );
      }
    }

    let nextSearchResources: SearchResourceEntry[] | undefined;
    let nextSearchDomainIds: string[] | undefined;
    if (validated.searchResources !== undefined) {
      try {
        if (isOrgInstallMode() && session.user.orgId) {
          const orgSearchRows = await listOrgSearchResources(
            session.user.orgId,
          );
          nextSearchResources = overlayUserSearchResourceEnabled({
            orgResources: orgSearchRows.map(orgSearchResourceToClient),
            incoming: (validated.searchResources ?? []).map((item) => ({
              id: item.id,
              label: item.label,
              url: item.url,
              enabled: item.enabled !== false,
              catalogId: item.catalogId ?? null,
            })),
          });
        } else {
          nextSearchResources = assertSearchResourceList(
            (validated.searchResources ?? []).map((item) => ({
              id: item.id,
              label: item.label,
              url: item.url,
              enabled: item.enabled !== false,
              catalogId: item.catalogId ?? null,
            })),
          );
        }
        nextSearchDomainIds = enabledSearchResourceIds(nextSearchResources);
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Invalid search resources.",
          },
          { status: 400 },
        );
      }
    }

    await upsertUserSettings({
      userId: session.user.id,
      googleApiKey: nextGoogleKey,
      anthropicApiKey: nextAnthropicKey,
      openaiApiKey: nextOpenAIKey,
      // Clear legacy Inception key when settings are saved
      inceptionApiKey: null,
      aiProvider: nextLegacyProvider,
      netsuiteAccountId: nextAccountId,
      netsuiteClientId: nextClientId,
      netsuiteAccounts: nextAccounts,
      timezone: validated.timezone,
      searchDomainIds: nextSearchDomainIds,
      searchResources: nextSearchResources,
      maxIterations: nextMaxIterations,
      customInstructions: validated.customInstructions,
      enabledSkillIds: nextEnabledSkillIds,
      customSkills: nextCustomSkills,
      disabledOrgConnectedSkillSourceIds:
        nextDisabledOrgConnectedSkillSourceIds,
      aiProviders: nextAiProviders,
      netsuiteMcpTools: nextNetsuiteMcpTools,
      defaultPersonaId: nextDefaultPersonaId,
      hidePersonaPicker: nextHidePersonaPicker,
      customPersonas: nextCustomPersonas,
    });

    return NextResponse.json({
      success: true,
      message: "Settings saved successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid settings data", details: error.errors },
        { status: 400 },
      );
    }

    console.error("[Settings] Error saving settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 },
    );
  }
}
