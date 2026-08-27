import { geolocation } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
  type LanguageModel,
  smoothStream,
  stepCountIs,
  streamText,
  type ToolSet,
} from "ai";
import { unstable_cache as cache } from "next/cache";
import { after } from "next/server";
import type { ModelCatalog } from "tokenlens/core";
import { fetchModels } from "tokenlens/fetch";
import { getUsage } from "tokenlens/helpers";
import { auth, type UserType } from "@/app/(auth)/auth";
import { refineChatTitle } from "@/app/(chat)/actions";
import type { VisibilityType } from "@/components/visibility-selector";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import type { ChatModel } from "@/lib/ai/models";
import { buildPersonaBuilderPrompt } from "@/lib/ai/personas/builder-prompt";
import {
  AVA_PERSONA_ID,
  isPersonaBuilderId,
  isValidPersonaId,
  MAX_CUSTOM_PERSONAS,
  normalizeCustomPersonas,
  PERSONA_BUILDER_ID,
  resolvePersona,
} from "@/lib/ai/personas/catalog";
import {
  builderChatTitle,
  emptyPersonaInterviewState,
  normalizePersonaInterviewState,
  type PersonaInterviewState,
} from "@/lib/ai/personas/interview";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import type { AiProviderType } from "@/lib/ai/provider-entries";
import { getUserProvider } from "@/lib/ai/providers";
import {
  hydrateSearchResources,
  mergeOrgSearchResourcesForUser,
  type SearchResourceEntry,
  searchResourceToolName,
} from "@/lib/ai/search-resources";
import {
  buildSkillsPromptSection,
  listConnectedCatalogSkills,
  listEnabledSkillNames,
  normalizeUserSkillSettings,
} from "@/lib/ai/skills/catalog";
import { createGetCurrentConfigTool } from "@/lib/ai/tools/get-current-config";
import {
  createProposeCustomPersonaTool,
  createUpdatePersonaInterviewTool,
} from "@/lib/ai/tools/persona-interview";
import { createReadWebpageTool } from "@/lib/ai/tools/read-webpage";
import { createSearchResourceTool } from "@/lib/ai/tools/search-web-resource";
import { isProductionEnvironment, isTestEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  getUserSettings,
  saveChat,
  saveMessages,
  updateChatLastContextById,
  updateChatMaxIterationsReached,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";
import { loadNetSuiteMCPTools } from "@/lib/netsuite/mcp";
import { resolveConnectedSkillsScopeId } from "@/lib/org/connected-skills";
import {
  assertOrgPersonaAllowed,
  buildOrgAwareSkillSettings,
  normalizeDisabledOrgConnectedSkillSourceIds,
  resolveOrgAwareChatProvider,
} from "@/lib/org/enforcement";
import { isOrgInstallMode } from "@/lib/org/install-config";
import {
  listEnabledOrgSearchResources,
  orgSearchResourceToClient,
} from "@/lib/org/search-resources";
import { allowChatBurst } from "@/lib/rate-limit";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import {
  convertToUIMessages,
  generateUUID,
  getTextFromMessage,
  prepareMessagesForModel,
} from "@/lib/utils";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

type AiProvider = AiProviderType;

function placeholderChatTitle(message: ChatMessage): string {
  const text = getTextFromMessage(message).trim();
  return text.slice(0, 50) || "New Chat";
}

const getTokenlensCatalog = cache(
  async (): Promise<ModelCatalog | undefined> => {
    if (isTestEnvironment) {
      return;
    }
    try {
      return await fetchModels();
    } catch (err) {
      console.warn(
        "TokenLens: catalog fetch failed, using default catalog",
        err,
      );
      return; // tokenlens helpers will fall back to defaultCatalog
    }
  },
  ["tokenlens-catalog"],
  { revalidate: 24 * 60 * 60 }, // 24 hours
);

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
      aiProviderId,
      personaId: requestPersonaId,
      refiningPersonaId: requestRefiningPersonaId,
      invokedConnectedSkillIds: requestInvokedConnectedSkillIds,
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: ChatModel["id"];
      selectedVisibilityType: VisibilityType;
      aiProviderId?: string | null;
      personaId?: string | null;
      refiningPersonaId?: string | null;
      invokedConnectedSkillIds?: string[];
    } = requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const userType: UserType = session.user.type;

    const burstAllowed = await allowChatBurst(session.user.id);
    if (!burstAllowed) {
      return new ChatSDKError(
        "rate_limit:chat",
        "Too many messages in a short period. Wait a minute and try again.",
      ).toResponse();
    }

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError("rate_limit:chat").toResponse();
    }

    const chat = await getChatById({ id });
    let messagesFromDb: DBMessage[] = [];
    let stampedPersonaId: string | null = null;
    let stampedRefiningPersonaId: string | null = null;
    let interviewState: PersonaInterviewState | null = null;
    let cachedSettings: Awaited<ReturnType<typeof getUserSettings>> | undefined;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }
      // Only fetch messages if chat already exists
      messagesFromDb = await getMessagesByChatId({ id });
      // Persona locked after create — ignore client personaId
      stampedPersonaId = chat.personaId ?? null;
      stampedRefiningPersonaId = chat.refiningPersonaId ?? null;
      interviewState = chat.personaInterview
        ? normalizePersonaInterviewState(chat.personaInterview)
        : isPersonaBuilderId(stampedPersonaId)
          ? emptyPersonaInterviewState()
          : null;
    } else {
      // Get user API key and provider for title generation
      let titleApiKey: string | null = null;
      let titleProvider: AiProvider = "google";
      let titleBaseUrl: string | undefined;
      let titleSpeedModelId: string | undefined;
      let titleReasoningModelId: string | undefined;
      let stampedProviderId = aiProviderId?.trim() || null;
      if (session.user?.id) {
        try {
          cachedSettings = await getUserSettings({ userId: session.user.id });
          const resolved = await resolveOrgAwareChatProvider({
            orgId: session.user.orgId,
            userId: session.user.id,
            chatAiProviderId: aiProviderId ?? null,
            settings: cachedSettings,
          });
          if (resolved.type) {
            titleProvider = resolved.type;
            titleApiKey = resolved.apiKey;
            titleBaseUrl = resolved.entry?.baseUrl;
            titleSpeedModelId = resolved.entry?.speedModelId;
            titleReasoningModelId = resolved.entry?.reasoningModelId;
          }
          if (!stampedProviderId && resolved.entry?.id) {
            stampedProviderId = resolved.entry.id;
          }
        } catch (error) {
          console.error("[Settings] Error loading settings for title:", error);
        }
      }

      const customPersonas = normalizeCustomPersonas(
        cachedSettings?.customPersonas,
      );
      const requested = requestPersonaId?.trim() || null;
      if (requested) {
        if (!isValidPersonaId(requested, customPersonas)) {
          return new ChatSDKError(
            "bad_request:api",
            "Unknown persona. Pick a valid persona and try again.",
          ).toResponse();
        }
        if (isOrgInstallMode() && session.user.orgId) {
          try {
            await assertOrgPersonaAllowed({
              orgId: session.user.orgId,
              userId: session.user.id,
              personaId: requested,
            });
          } catch (error) {
            return new ChatSDKError(
              "bad_request:api",
              error instanceof Error
                ? error.message
                : "Persona is not allowed for your organization.",
            ).toResponse();
          }
        }
        stampedPersonaId = requested === AVA_PERSONA_ID ? null : requested;
      } else if (cachedSettings?.defaultPersonaId) {
        const def = cachedSettings.defaultPersonaId.trim();
        if (
          isValidPersonaId(def, customPersonas) &&
          def !== AVA_PERSONA_ID &&
          !isPersonaBuilderId(def)
        ) {
          let defaultAllowed = true;
          if (isOrgInstallMode() && session.user.orgId) {
            try {
              await assertOrgPersonaAllowed({
                orgId: session.user.orgId,
                userId: session.user.id,
                personaId: def,
              });
            } catch {
              defaultAllowed = false;
            }
          }
          if (defaultAllowed) {
            stampedPersonaId = def;
          }
        }
      }

      if (isPersonaBuilderId(stampedPersonaId)) {
        if (userType !== "regular") {
          return new ChatSDKError(
            "forbidden:chat",
            "Sign in to create a persona with the interview.",
          ).toResponse();
        }

        const refineId = requestRefiningPersonaId?.trim() || null;
        if (refineId) {
          const target = customPersonas.find((p) => p.id === refineId);
          if (!target) {
            return new ChatSDKError(
              "bad_request:api",
              "Unknown persona to refine.",
            ).toResponse();
          }
          stampedRefiningPersonaId = refineId;
        } else if (customPersonas.length >= MAX_CUSTOM_PERSONAS) {
          return new ChatSDKError(
            "bad_request:api",
            "Custom persona limit reached. Delete or refine an existing persona.",
          ).toResponse();
        }

        interviewState = emptyPersonaInterviewState();
        const refineName = stampedRefiningPersonaId
          ? customPersonas.find((p) => p.id === stampedRefiningPersonaId)?.name
          : null;
        const title = builderChatTitle({ refiningName: refineName });

        await saveChat({
          id,
          userId: session.user.id,
          title,
          summary: null,
          visibility: selectedVisibilityType,
          aiProviderId: stampedProviderId,
          personaId: PERSONA_BUILDER_ID,
          refiningPersonaId: stampedRefiningPersonaId,
          personaInterview: interviewState,
        });
      } else {
        await saveChat({
          id,
          userId: session.user.id,
          title: placeholderChatTitle(message),
          summary: null,
          visibility: selectedVisibilityType,
          aiProviderId: stampedProviderId,
          personaId: stampedPersonaId,
        });

        if (titleProvider !== "custom" && titleApiKey) {
          after(async () => {
            try {
              await refineChatTitle({
                chatId: id,
                message,
                apiKey: titleApiKey,
                provider: titleProvider,
                baseUrl: titleBaseUrl,
                speedModelId: titleSpeedModelId,
                reasoningModelId: titleReasoningModelId,
              });
            } catch (error) {
              console.error("[Title] Error refining title:", error);
            }
          });
        }
      }
      // New chat - no need to fetch messages, it's empty
    }

    const uiMessages = [...convertToUIMessages(messagesFromDb), message];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: "user",
          parts: message.parts,
          createdAt: new Date(),
        },
      ],
    });

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    let finalMergedUsage: AppUsage | undefined;
    let hasErrorOccurred: boolean = false;

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        try {
          // Get user settings (API key, provider, timezone, and maxIterations)
          let userApiKey: string | null = null;
          let userProviderType: AiProvider = "google";
          let userTimezone = "UTC";
          let userMaxIterations = 10; // Default to 10
          let enabledSearchResources: SearchResourceEntry[] = [];
          let skillsPromptSection = "";
          let enabledSkillNames: string[] = [
            "AI Connector Instructions (always on)",
          ];
          let customBaseUrl: string | undefined;
          let customSpeedModelId: string | undefined;
          let customReasoningModelId: string | undefined;
          let userProviderLabel: string | null = null;
          let netsuiteAccountId: string | null = null;
          let customPersonasForPrompt = normalizeCustomPersonas([]);
          let sessionSettings: Awaited<ReturnType<typeof getUserSettings>> =
            null;
          let invokedConnectedSkillSlugs = new Set<string>();
          let invokedSkillFallbackText: string | undefined;
          if (session.user?.id) {
            try {
              const settings =
                cachedSettings === undefined
                  ? await getUserSettings({
                      userId: session.user.id,
                    })
                  : cachedSettings;
              sessionSettings = settings;
              console.log("[Settings] Loaded settings for user:", {
                userId: session.user.id,
                hasSettings: !!settings,
                provider: settings?.aiProvider,
                hasGoogleKey: !!settings?.googleApiKey,
                hasAnthropicKey: !!settings?.anthropicApiKey,
                hasOpenAIKey: !!settings?.openaiApiKey,
                maxIterations: settings?.maxIterations,
              });
              if (settings) {
                netsuiteAccountId = settings.netsuiteAccountId?.trim()
                  ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
                  : null;
                const latestChat = await getChatById({ id });
                if (latestChat?.personaId !== undefined) {
                  stampedPersonaId = latestChat.personaId ?? null;
                }
                if (latestChat) {
                  stampedRefiningPersonaId =
                    latestChat.refiningPersonaId ?? null;
                  interviewState = latestChat.personaInterview
                    ? normalizePersonaInterviewState(
                        latestChat.personaInterview,
                      )
                    : isPersonaBuilderId(stampedPersonaId)
                      ? emptyPersonaInterviewState()
                      : null;
                }
                customPersonasForPrompt = normalizeCustomPersonas(
                  settings.customPersonas,
                );
                const resolved = await resolveOrgAwareChatProvider({
                  orgId: session.user.orgId,
                  userId: session.user.id,
                  chatAiProviderId: latestChat?.aiProviderId,
                  settings,
                });
                if (resolved.dangling) {
                  throw new Error(
                    "This chat's AI provider was removed. Pick another provider in the chat header.",
                  );
                }
                if (resolved.missing || !resolved.type) {
                  throw new Error(
                    "API key is required. Please set your API key in Settings.",
                  );
                }
                userProviderType = resolved.type;
                userApiKey = resolved.apiKey;
                userMaxIterations = resolved.maxIterations;
                userProviderLabel = resolved.label;
                customBaseUrl = resolved.entry?.baseUrl;
                customSpeedModelId = resolved.entry?.speedModelId;
                customReasoningModelId = resolved.entry?.reasoningModelId;
                userTimezone = settings.timezone ?? "UTC";
                enabledSearchResources = hydrateSearchResources({
                  searchResources: settings.searchResources,
                  searchDomainIds: settings.searchDomainIds,
                }).filter((resource) => resource.enabled);
                const skillSettings = normalizeUserSkillSettings(
                  {
                    enabledSkillIds: settings.enabledSkillIds ?? [],
                    customSkills: settings.customSkills ?? [],
                    connectedSkillSources: settings.connectedSkillSources ?? [],
                  },
                  settings.customInstructions,
                );
                const skillSettingsForChat =
                  isOrgInstallMode() && session.user.orgId
                    ? await buildOrgAwareSkillSettings({
                        orgId: session.user.orgId,
                        enabledSkillIds: skillSettings.enabledSkillIds,
                        customSkills: skillSettings.customSkills,
                        connectedSkillSources:
                          skillSettings.connectedSkillSources,
                        disabledOrgConnectedSkillSourceIds:
                          normalizeDisabledOrgConnectedSkillSourceIds(
                            settings.disabledOrgConnectedSkillSourceIds,
                          ),
                      })
                    : skillSettings;
                const invokedConnectedSkillIds = (
                  requestInvokedConnectedSkillIds ?? []
                ).filter(
                  (skillId) =>
                    typeof skillId === "string" &&
                    skillId.startsWith("connected:") &&
                    skillSettingsForChat.connectedSkillSources.some((source) =>
                      skillId.startsWith(`connected:${source.id}:`),
                    ),
                );
                const connectedScopeId = resolveConnectedSkillsScopeId(
                  session.user.id,
                  session.user.orgId,
                );
                const invokedConnectedSkills = listConnectedCatalogSkills(
                  connectedScopeId,
                  skillSettingsForChat.connectedSkillSources,
                ).filter((skill) =>
                  invokedConnectedSkillIds.includes(skill.id),
                );
                invokedConnectedSkillSlugs = new Set(
                  invokedConnectedSkills
                    .map((skill) => skill.slug?.toLowerCase() ?? "")
                    .filter(Boolean),
                );
                if (invokedConnectedSkills.length > 0) {
                  const fallbackNames = invokedConnectedSkills
                    .map((skill) => skill.name)
                    .join(", ");
                  invokedSkillFallbackText = `Use the ${fallbackNames} skill${invokedConnectedSkills.length === 1 ? "" : "s"}.`;
                }
                skillsPromptSection = buildSkillsPromptSection(
                  skillSettingsForChat,
                  {
                    invokedConnectedSkillIds,
                    userId: connectedScopeId,
                  },
                );
                enabledSkillNames = listEnabledSkillNames(
                  skillSettingsForChat,
                  {
                    invokedConnectedSkillIds,
                    userId: connectedScopeId,
                  },
                );
                console.log("[Skills] Session skills:", {
                  enabledIds: skillSettingsForChat.enabledSkillIds,
                  enabledNames: enabledSkillNames,
                  customCount: skillSettingsForChat.customSkills.filter(
                    (skill) => skill.enabled !== false,
                  ).length,
                  invokedConnectedSkillIds,
                  injectedChars: skillsPromptSection.length,
                });
              } else {
                console.log(
                  "[Settings] No settings found for user:",
                  session.user.id,
                );
              }

              if (isOrgInstallMode() && session.user.orgId) {
                const orgSearchRows = await listEnabledOrgSearchResources(
                  session.user.orgId,
                );
                enabledSearchResources = mergeOrgSearchResourcesForUser({
                  orgResources: orgSearchRows.map(orgSearchResourceToClient),
                  userResources: settings?.searchResources,
                }).filter((resource) => resource.enabled);
              }
            } catch (error) {
              console.error("[Settings] Error loading user settings:", error);
              throw error;
            }
          }

          const activePersona = resolvePersona({
            personaId: stampedPersonaId,
            customPersonas: customPersonasForPrompt,
          });
          const isBuilderSession = isPersonaBuilderId(stampedPersonaId);
          const refiningPersona = stampedRefiningPersonaId
            ? customPersonasForPrompt.find(
                (p) => p.id === stampedRefiningPersonaId,
              )
            : null;

          // Create provider with user's API key and provider type
          console.log("[Settings] Creating provider:", {
            provider: userProviderType,
            hasUserApiKey: !!userApiKey,
            userApiKeyLength: userApiKey?.length,
          });
          let userProvider: ReturnType<typeof getUserProvider>;
          try {
            userProvider = getUserProvider(userApiKey, userProviderType, {
              baseUrl: customBaseUrl,
              speedModelId: customSpeedModelId,
              reasoningModelId: customReasoningModelId,
            });
            console.log("[Settings] Provider created successfully");
          } catch (error) {
            const providerName =
              userProviderType === "anthropic"
                ? "Anthropic"
                : userProviderType === "openai"
                  ? "OpenAI"
                  : userProviderType === "custom"
                    ? "Custom"
                    : "Google";
            const errorMessage =
              error instanceof Error
                ? error.message
                : `${providerName} API key is required`;
            console.error(
              "[Settings] Failed to create provider:",
              errorMessage,
            );
            throw new Error(errorMessage);
          }

          // Load NetSuite MCP tools if user is authenticated (skipped in builder)
          let netsuiteTools: Record<string, unknown> = {};
          let netsuiteActiveToolKeys: string[] = [];
          if (session.user?.id && !isBuilderSession) {
            try {
              const loaded = await loadNetSuiteMCPTools(session.user.id, {
                settings: sessionSettings,
                orgId: session.user.orgId,
              });
              netsuiteTools = loaded.tools;
              netsuiteActiveToolKeys = loaded.activeToolKeys;
              if (Object.keys(netsuiteTools).length > 0) {
                console.log(
                  `[NetSuite] Loaded ${Object.keys(netsuiteTools).length} tools (${netsuiteActiveToolKeys.length} allowed):`,
                  Object.keys(netsuiteTools),
                );
              } else {
                console.log(
                  "[NetSuite] No tools loaded - user may not be connected or no tools available",
                );
              }
            } catch (error) {
              console.error("[NetSuite] Error loading tools:", error);
              // Continue without NetSuite tools if there's an error
            }
          }

          // Custom web search tools: only register tools for domains enabled in settings
          const searchToolEntries: [string, unknown][] = [];
          if (!isBuilderSession) {
            for (const resource of enabledSearchResources) {
              searchToolEntries.push([
                searchResourceToolName(resource),
                createSearchResourceTool(resource),
              ]);
            }
          }
          const searchTools = Object.fromEntries(searchToolEntries);

          // Merge base tools with NetSuite tools (builder: interview tools only)
          const interviewTools = isBuilderSession
            ? {
                updatePersonaInterview: createUpdatePersonaInterviewTool({
                  chatId: id,
                  getPreviousState: () => interviewState,
                  onUpdated: (state) => {
                    interviewState = state;
                  },
                }),
                proposeCustomPersona: createProposeCustomPersonaTool({
                  chatId: id,
                  getInterviewState: () => interviewState,
                  onCoverageUpdated: (state) => {
                    interviewState = state;
                  },
                }),
              }
            : {};

          const allTools = isBuilderSession
            ? { ...interviewTools }
            : {
                ...searchTools,
                readWebpage: createReadWebpageTool(),
                ...netsuiteTools,
              };

          // Offer only allowed NetSuite tools to the model; disabled tools stay
          // registered so an invoke returns a clear error instead of 404.
          const netsuiteToolNames = isBuilderSession
            ? []
            : netsuiteActiveToolKeys;
          const baseToolNames = isBuilderSession
            ? [
                "updatePersonaInterview",
                "proposeCustomPersona",
                "getCurrentConfig",
              ]
            : [...Object.keys(searchTools), "readWebpage", "getCurrentConfig"];
          console.log(
            `[NetSuite] Active NetSuite tools (${netsuiteToolNames.length}):`,
            netsuiteToolNames,
          );
          console.log("[Tools] All available tools:", Object.keys(allTools));
          const activeTools: string[] = [
            ...baseToolNames,
            ...netsuiteToolNames,
          ];

          const systemPromptText = isBuilderSession
            ? buildPersonaBuilderPrompt({
                refiningPersona: refiningPersona ?? null,
              })
            : `${systemPrompt({
                selectedChatModel,
                requestHints,
                netsuiteTools: netsuiteToolNames,
                timezone: userTimezone,
                enabledSearchToolNames: Object.keys(searchTools),
                searchManagedByOrg: isOrgInstallMode(),
                maxSteps: userMaxIterations,
                netsuiteAccountId,
                persona: {
                  name: activePersona.name,
                  instructions: activePersona.instructions,
                  confirmBeforeSuiteQL: activePersona.confirmBeforeSuiteQL,
                },
              })}${skillsPromptSection}`;
          console.log(
            isBuilderSession
              ? `[PersonaBuilder] Interview session; refine=${stampedRefiningPersonaId ?? "create"}`
              : `[NetSuite] System prompt includes ${netsuiteToolNames.length} NetSuite tools` +
                  (skillsPromptSection
                    ? ` + ${skillsPromptSection.length} chars of skills`
                    : "") +
                  ` + persona ${activePersona.id}`,
          );

          // Both providers use the same model keys (chat-model, chat-model-reasoning, title-model)
          const modelId = selectedChatModel;

          // Add getCurrentConfig tool with resolved model information
          const allToolsWithConfig = {
            ...allTools,
            getCurrentConfig: createGetCurrentConfigTool({
              selectedModelId: selectedChatModel,
              resolvedModelId: modelId,
              provider: userProviderType,
              timezone: userTimezone,
              enabledSearchDomains: enabledSearchResources.map(
                (resource) => resource.label,
              ),
              enabledSkills: enabledSkillNames,
              persona: {
                id: activePersona.id,
                name: activePersona.name,
              },
              modelName:
                userProviderType === "custom"
                  ? `${userProviderLabel ?? "custom"} · ${
                      modelId === "chat-model-reasoning"
                        ? customReasoningModelId
                        : customSpeedModelId
                    }`
                  : undefined,
              modelDescription:
                userProviderType === "custom"
                  ? modelId === "chat-model-reasoning"
                    ? "Reasoning mode — custom endpoint"
                    : "Speed mode — custom endpoint"
                  : undefined,
            }),
          } as ToolSet;

          // Verify the model exists before calling streamText
          let languageModel: LanguageModel;
          try {
            languageModel = userProvider.languageModel(modelId);
            console.log("[Chat] Model resolved:", {
              provider: userProviderType,
              modelId,
              selectedChatModel,
              resolvedModelId: languageModel.modelId,
            });
          } catch (modelError) {
            console.error("[Chat] Error resolving model:", modelError);
            const errorMessage =
              modelError instanceof Error
                ? modelError.message
                : `Model ${modelId} not found for ${userProviderType} provider`;
            // Throw error so SDK can handle it
            throw new Error(errorMessage);
          }

          // Clear maxIterationsReached at start of each request so we never show
          // the card for a response that didn't hit the limit (avoids stale flag).
          if (chat?.maxIterationsReached) {
            await updateChatMaxIterationsReached({
              chatId: id,
              maxIterationsReached: false,
            });
          }

          console.log("[Chat] Starting streamText:", {
            provider: userProviderType,
            modelId,
            selectedChatModel,
            hasProvider: !!userProvider,
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let result: any;
          try {
            // AI SDK 6: convertToModelMessages is now async
            const modelMessages = await convertToModelMessages(
              prepareMessagesForModel(uiMessages, {
                invokedSkillSlugs: invokedConnectedSkillSlugs,
                fallbackText: invokedSkillFallbackText,
              }),
            );
            result = streamText({
              model: languageModel,
              system: systemPromptText,
              messages: modelMessages,
              stopWhen: stepCountIs(userMaxIterations),
              abortSignal: request.signal,
              experimental_activeTools: activeTools as never,
              experimental_transform: smoothStream({ chunking: "word" }),
              tools: allToolsWithConfig,
              // Apply reasoning/thinking config based on provider
              // Both use similar token budgets (4K) for thinking/reasoning
              ...(modelId === "chat-model-reasoning" &&
                (userProviderType === "google"
                  ? {
                      providerOptions: {
                        google: {
                          thinkingConfig: {
                            thinkingBudget: 4096, // Allocates 4K tokens for thought
                            includeThoughts: true,
                          },
                        },
                      },
                    }
                  : userProviderType === "anthropic"
                    ? {
                        providerOptions: {
                          anthropic: {
                            // Sonnet 5+ rejects thinking.type.enabled; use adaptive + effort
                            thinking: {
                              type: "adaptive",
                              display: "summarized",
                            },
                            effort: "high",
                          },
                        },
                      }
                    : userProviderType === "openai" ||
                        userProviderType === "custom"
                      ? {
                          providerOptions: {
                            openai: {
                              reasoningEffort: "high",
                              reasoningSummary: "detailed",
                            },
                          },
                        }
                      : {})),
              experimental_telemetry: {
                isEnabled: isProductionEnvironment,
                functionId: "stream-text",
              },
              onFinish: async ({ usage, steps }) => {
                const stepCount = steps?.length ?? 0;
                console.log(
                  "[Chat] Stream finished, step count:",
                  stepCount,
                  "max:",
                  userMaxIterations,
                );

                if (stepCount === userMaxIterations) {
                  console.log("[Chat] Max steps reached, setting flag");

                  // Set the maxIterationsReached flag on the chat
                  // This will lock the thread until user chooses an option
                  await updateChatMaxIterationsReached({
                    chatId: id,
                    maxIterationsReached: true,
                  });
                }

                try {
                  const providers = await getTokenlensCatalog();
                  const resolvedModelId =
                    userProvider.languageModel(modelId).modelId;
                  if (!resolvedModelId) {
                    finalMergedUsage = usage;
                    dataStream.write({
                      type: "data-usage",
                      data: finalMergedUsage,
                    });
                    return;
                  }

                  if (!providers) {
                    finalMergedUsage = usage;
                    dataStream.write({
                      type: "data-usage",
                      data: finalMergedUsage,
                    });
                    return;
                  }

                  const summary = getUsage({
                    modelId: resolvedModelId,
                    usage,
                    providers,
                  });
                  finalMergedUsage = {
                    ...usage,
                    ...summary,
                    modelId: resolvedModelId,
                  } as AppUsage;
                  dataStream.write({
                    type: "data-usage",
                    data: finalMergedUsage,
                  });
                } catch (err) {
                  console.warn("TokenLens enrichment failed", err);
                  finalMergedUsage = usage;
                  dataStream.write({
                    type: "data-usage",
                    data: finalMergedUsage,
                  });
                }
              },
            });
            console.log("[Chat] streamText created successfully");
          } catch (streamError) {
            console.error("[Chat] Error creating streamText:", streamError);
            // Re-throw error so SDK can handle it
            throw streamError;
          }

          result.consumeStream();
          // Send reasoning for providers that support it
          // OpenAI reasoning comes through as 'reasoning' parts in the stream when reasoningSummary is enabled
          const supportsReasoning =
            userProviderType === "google" ||
            userProviderType === "anthropic" ||
            ((userProviderType === "openai" || userProviderType === "custom") &&
              modelId === "chat-model-reasoning");

          // Merge the UI message stream directly - max steps detection happens in onFinish callback
          dataStream.merge(
            result.toUIMessageStream({
              sendReasoning: supportsReasoning,
            }),
          );
          console.log("[Chat] Stream merged successfully");
        } catch (unhandledError) {
          // Re-throw any unhandled errors so SDK can handle them
          console.error("[Chat] Unhandled error in execute:", unhandledError);
          throw unhandledError;
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages }) => {
        // Don't save messages if an error occurred - error is already saved in onError
        if (hasErrorOccurred) {
          console.log("[Chat] Skipping onFinish save - error occurred");
          return;
        }

        const validMessages = messages
          .filter((currentMessage) => {
            // Check if message has parts
            if (!currentMessage.parts || currentMessage.parts.length === 0) {
              return false;
            }
            // Check if at least one part has content
            return currentMessage.parts.some((part) => {
              if (part.type === "text") {
                return part.text && part.text.trim().length > 0;
              }
              return true; // Non-text parts are considered valid
            });
          })
          .map((currentMessage) => ({
            id: currentMessage.id,
            role: currentMessage.role,
            parts: currentMessage.parts,
            createdAt: new Date(),
            chatId: id,
          }));

        // Only save if there are valid messages
        if (validMessages.length > 0) {
          await saveMessages({
            messages: validMessages,
          });
        }

        if (finalMergedUsage) {
          try {
            await updateChatLastContextById({
              chatId: id,
              context: finalMergedUsage,
            });
          } catch (err) {
            console.warn("Unable to persist last usage for chat", id, err);
          }
        }
      },
      onError: (error: unknown) => {
        // Mark that an error occurred to prevent onFinish from saving empty messages
        hasErrorOccurred = true;

        // Log error for debugging - SDK will handle propagation to client
        console.error("[Chat] Error in onError handler:", error);

        // Extract error message and details
        let errorMessage = "An error occurred";
        let errorDetails: string | null = null;

        if (error instanceof Error) {
          errorMessage = error.message || error.toString();

          // Check if it's an API call error with response body
          if (
            "responseBody" in error &&
            typeof error.responseBody === "string"
          ) {
            try {
              const errorBody = JSON.parse(error.responseBody);
              if (errorBody?.error?.message) {
                errorMessage = errorBody.error.message;
                if (errorBody.error?.param) {
                  errorDetails = `Parameter: ${errorBody.error.param}`;
                }
                if (errorBody.error?.code) {
                  errorDetails = errorDetails
                    ? `${errorDetails}, Code: ${errorBody.error.code}`
                    : `Code: ${errorBody.error.code}`;
                }
              }
            } catch {
              errorDetails = error.responseBody;
            }
          }

          if ("statusCode" in error && error.statusCode) {
            errorDetails = errorDetails
              ? `${errorDetails}, Status: ${error.statusCode}`
              : `Status: ${error.statusCode}`;
          }
        }

        // Format error message
        const errorMessageText = errorDetails
          ? `**Error:** ${errorMessage}\n\n**Details:**\n${errorDetails}`
          : `**Error:** ${errorMessage}`;

        // Save error message to database so it persists across page reloads
        // Fire-and-forget - don't block the error handler
        void saveMessages({
          messages: [
            {
              chatId: id,
              id: generateUUID(),
              role: "assistant",
              parts: [
                {
                  type: "text",
                  text: errorMessageText,
                },
              ],
              createdAt: new Date(),
            },
          ],
        }).catch((saveError) => {
          console.error(
            "[Chat] Failed to save error message to database:",
            saveError,
          );
          // Continue even if save fails - error will still be shown via SDK
        });

        // Return error message for SDK to display
        return errorMessage;
      },
    });

    return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    // Check for Vercel AI Gateway credit card error
    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests",
      )
    ) {
      return new ChatSDKError("bad_request:activate_gateway").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatSDKError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
