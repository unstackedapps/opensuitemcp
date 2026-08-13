import { geolocation } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
  type LanguageModel,
  smoothStream,
  stepCountIs,
  streamText,
} from "ai";
import { unstable_cache as cache } from "next/cache";
import type { ModelCatalog } from "tokenlens/core";
import { fetchModels } from "tokenlens/fetch";
import { getUsage } from "tokenlens/helpers";
import { auth, type UserType } from "@/app/(auth)/auth";
import { generateTitleFromUserMessage } from "@/app/(chat)/actions";
import type { VisibilityType } from "@/components/visibility-selector";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import type { ChatModel } from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import type { AiProviderType } from "@/lib/ai/provider-entries";
import { getUserProvider } from "@/lib/ai/providers";
import { resolveUserChatProvider } from "@/lib/ai/resolve-user-chat-provider";
import { searchDomains } from "@/lib/ai/search-domains";
import {
  buildSkillsPromptSection,
  listEnabledSkillNames,
  normalizeUserSkillSettings,
} from "@/lib/ai/skills/catalog";
import { createGetCurrentConfigTool } from "@/lib/ai/tools/get-current-config";
import { createReadWebpageTool } from "@/lib/ai/tools/read-webpage";
import { createSearchNetsuiteDocsTool } from "@/lib/ai/tools/search-netsuite-docs";
import { isProductionEnvironment } from "@/lib/constants";
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
import { loadNetSuiteMCPTools } from "@/lib/netsuite/mcp";
import { allowChatBurst } from "@/lib/rate-limit";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

type AiProvider = AiProviderType;

const getTokenlensCatalog = cache(
  async (): Promise<ModelCatalog | undefined> => {
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
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: ChatModel["id"];
      selectedVisibilityType: VisibilityType;
      aiProviderId?: string | null;
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

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }
      // Only fetch messages if chat already exists
      messagesFromDb = await getMessagesByChatId({ id });
    } else {
      // Get user API key and provider for title generation
      let titleApiKey: string | null = null;
      let titleProvider: AiProvider = "google";
      let titleBaseUrl: string | undefined;
      let titleSpeedModelId: string | undefined;
      let titleReasoningModelId: string | undefined;
      if (session.user?.id) {
        try {
          const settings = await getUserSettings({ userId: session.user.id });
          const resolved = resolveUserChatProvider({
            chatAiProviderId: aiProviderId ?? null,
            settings,
          });
          if (resolved.type) {
            titleProvider = resolved.type;
            titleApiKey = resolved.apiKey;
            titleBaseUrl = resolved.entry?.baseUrl;
            titleSpeedModelId = resolved.entry?.speedModelId;
            titleReasoningModelId = resolved.entry?.reasoningModelId;
          }
        } catch (error) {
          console.error("[Settings] Error loading settings for title:", error);
        }
      }
      const { title, summary } = await generateTitleFromUserMessage({
        message,
        apiKey: titleApiKey,
        provider: titleProvider,
        baseUrl: titleBaseUrl,
        speedModelId: titleSpeedModelId,
        reasoningModelId: titleReasoningModelId,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        summary,
        visibility: selectedVisibilityType,
        aiProviderId: aiProviderId ?? null,
      });
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
          let selectedSearchDomainIds: string[] = [];
          let skillsPromptSection = "";
          let enabledSkillNames: string[] = [
            "AI Connector Instructions (always on)",
          ];
          let customBaseUrl: string | undefined;
          let customSpeedModelId: string | undefined;
          let customReasoningModelId: string | undefined;
          let userProviderLabel: string | null = null;
          if (session.user?.id) {
            try {
              const settings = await getUserSettings({
                userId: session.user.id,
              });
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
                const latestChat = await getChatById({ id });
                const resolved = resolveUserChatProvider({
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
                selectedSearchDomainIds = settings.searchDomainIds ?? [];
                const skillSettings = normalizeUserSkillSettings(
                  {
                    enabledSkillIds: settings.enabledSkillIds ?? [],
                    customSkills: settings.customSkills ?? [],
                  },
                  settings.customInstructions,
                );
                skillsPromptSection = buildSkillsPromptSection(skillSettings);
                enabledSkillNames = listEnabledSkillNames(skillSettings);
                console.log("[Skills] Session skills:", {
                  enabledIds: skillSettings.enabledSkillIds,
                  enabledNames: enabledSkillNames,
                  customCount: skillSettings.customSkills.filter(
                    (skill) => skill.enabled !== false,
                  ).length,
                  injectedChars: skillsPromptSection.length,
                });
              } else {
                console.log(
                  "[Settings] No settings found for user:",
                  session.user.id,
                );
              }
            } catch (error) {
              console.error("[Settings] Error loading user settings:", error);
              throw error;
            }
          }

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

          // Load NetSuite MCP tools if user is authenticated
          let netsuiteTools: Record<string, unknown> = {};
          let netsuiteActiveToolKeys: string[] = [];
          if (session.user?.id) {
            try {
              const loaded = await loadNetSuiteMCPTools(session.user.id);
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
          const enabledSearchDomainIds = new Set(selectedSearchDomainIds);
          const searchToolEntries: [string, unknown][] = [];
          if (enabledSearchDomainIds.has("oracle-netsuite-help")) {
            searchToolEntries.push([
              "searchNetsuiteDocs",
              createSearchNetsuiteDocsTool(),
            ]);
          }
          const searchTools = Object.fromEntries(searchToolEntries);

          // Merge base tools with NetSuite tools
          const allTools = {
            ...searchTools,
            readWebpage: createReadWebpageTool(),
            ...netsuiteTools,
          };

          // Offer only allowed NetSuite tools to the model; disabled tools stay
          // registered so an invoke returns a clear error instead of 404.
          const netsuiteToolNames = netsuiteActiveToolKeys;
          const baseToolNames = [
            ...Object.keys(searchTools),
            "readWebpage",
            "getCurrentConfig",
          ];
          console.log(
            `[NetSuite] Active NetSuite tools (${netsuiteToolNames.length}):`,
            netsuiteToolNames,
          );
          console.log("[Tools] All available tools:", Object.keys(allTools));
          const activeTools: string[] = [
            ...baseToolNames,
            ...netsuiteToolNames,
          ];

          const systemPromptText = `${systemPrompt({
            selectedChatModel,
            requestHints,
            netsuiteTools: netsuiteToolNames,
            timezone: userTimezone,
            enabledSearchToolNames: Object.keys(searchTools),
            maxSteps: userMaxIterations,
          })}${skillsPromptSection}`;
          console.log(
            `[NetSuite] System prompt includes ${netsuiteToolNames.length} NetSuite tools` +
              (skillsPromptSection
                ? ` + ${skillsPromptSection.length} chars of skills`
                : ""),
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
              enabledSearchDomains: searchDomains
                .filter((d) => enabledSearchDomainIds.has(d.id))
                .map((d) => d.label),
              enabledSkills: enabledSkillNames,
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
          };

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
          await updateChatMaxIterationsReached({
            chatId: id,
            maxIterationsReached: false,
          });

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
            const modelMessages = await convertToModelMessages(uiMessages);
            result = streamText({
              model: languageModel,
              system: systemPromptText,
              messages: modelMessages,
              stopWhen: stepCountIs(userMaxIterations),
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
