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
import { getUserProvider } from "@/lib/ai/providers";
import { buildSearchConfig, getSearchDomainUrl } from "@/lib/ai/search-domains";
import { createGetCurrentConfigTool } from "@/lib/ai/tools/get-current-config";
import { createListSearchDomainsTool } from "@/lib/ai/tools/list-search-domains";
import { createReadWebpageTool } from "@/lib/ai/tools/read-webpage";
import { createWebSearchTool } from "@/lib/ai/tools/web-search";
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
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import { ChatSDKError } from "@/lib/errors";
import { loadNetSuiteMCPTools } from "@/lib/netsuite/mcp";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

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
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: ChatModel["id"];
      selectedVisibilityType: VisibilityType;
    } = requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const userType: UserType = session.user.type;

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
      let titleProvider: "google" | "anthropic" = "google";
      if (session.user?.id) {
        try {
          const settings = await getUserSettings({ userId: session.user.id });
          titleProvider =
            (settings?.aiProvider as "google" | "anthropic") || "google";
          const apiKeyField =
            titleProvider === "anthropic"
              ? settings?.anthropicApiKey
              : settings?.googleApiKey;
          if (apiKeyField) {
            titleApiKey = decrypt(apiKeyField);
          }
        } catch (error) {
          console.error("[Settings] Error loading settings for title:", error);
        }
      }
      const { title, summary } = await generateTitleFromUserMessage({
        message,
        apiKey: titleApiKey,
        provider: titleProvider,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        summary,
        visibility: selectedVisibilityType,
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

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        // Get user settings (API key, provider, and timezone)
        let userApiKey: string | null = null;
        let userProviderType: "google" | "anthropic" = "google";
        let userTimezone = "UTC";
        let selectedSearchDomainIds: string[] | undefined;
        if (session.user?.id) {
          try {
            const settings = await getUserSettings({ userId: session.user.id });
            console.log("[Settings] Loaded settings for user:", {
              userId: session.user.id,
              hasSettings: !!settings,
              provider: settings?.aiProvider,
              hasGoogleKey: !!settings?.googleApiKey,
              hasAnthropicKey: !!settings?.anthropicApiKey,
            });
            if (settings) {
              userProviderType =
                (settings.aiProvider as "google" | "anthropic") || "google";

              // Get API key based on selected provider
              const apiKeyField =
                userProviderType === "anthropic"
                  ? settings.anthropicApiKey
                  : settings.googleApiKey;

              if (apiKeyField) {
                try {
                  userApiKey = decrypt(apiKeyField);
                  console.log(
                    `[Settings] Successfully decrypted ${userProviderType} API key for user:`,
                    session.user.id,
                    "Key length:",
                    userApiKey?.length,
                  );
                } catch (error) {
                  console.error("[Settings] Error decrypting API key:", error);
                  // Continue without API key if decryption fails
                }
              } else {
                console.log(
                  `[Settings] No encrypted ${userProviderType} API key found in settings for user:`,
                  session.user.id,
                );
              }
              userTimezone = settings.timezone ?? "UTC";
              selectedSearchDomainIds = settings.searchDomainIds ?? [];
            } else {
              console.log(
                "[Settings] No settings found for user:",
                session.user.id,
              );
            }
          } catch (error) {
            console.error("[Settings] Error loading user settings:", error);
            // Continue with defaults
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
          userProvider = getUserProvider(userApiKey, userProviderType);
          console.log("[Settings] Provider created successfully");
        } catch (error) {
          // If no API key is configured, return an error to the user
          const providerName =
            userProviderType === "anthropic" ? "Anthropic" : "Google";
          const errorMessage =
            error instanceof Error
              ? error.message
              : `${providerName} API key is required`;
          console.error("[Settings] Failed to create provider:", errorMessage);
          dataStream.write({
            type: "error",
            errorText: errorMessage,
          });
          return;
        }

        const searchConfig = buildSearchConfig({
          selectedDomainIds: selectedSearchDomainIds,
          environment: process.env.NODE_ENV,
        });

        // Load NetSuite MCP tools if user is authenticated
        let netsuiteTools: Record<string, unknown> = {};
        if (session.user?.id) {
          try {
            netsuiteTools = await loadNetSuiteMCPTools(session.user.id);
            if (Object.keys(netsuiteTools).length > 0) {
              console.log(
                `[NetSuite] Loaded ${Object.keys(netsuiteTools).length} tools:`,
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

        // Merge base tools with NetSuite tools
        const allTools = {
          webSearch: createWebSearchTool({
            selectedDomainIds: selectedSearchDomainIds,
            environment: process.env.NODE_ENV,
          }),
          readWebpage: createReadWebpageTool(),
          listSearchDomains: createListSearchDomainsTool({
            selectedDomainIds: selectedSearchDomainIds,
            environment: process.env.NODE_ENV,
          }),
          ...netsuiteTools,
        };

        // Build active tools list (tools are enabled in both standard and reasoning modes)
        const netsuiteToolNames = Object.keys(netsuiteTools);
        const baseToolNames = [
          "webSearch",
          "readWebpage",
          "listSearchDomains",
          "getCurrentConfig",
        ];
        console.log(
          `[NetSuite] Active NetSuite tools (${netsuiteToolNames.length}):`,
          netsuiteToolNames,
        );
        console.log("[Tools] All available tools:", Object.keys(allTools));
        const activeTools: string[] = [...baseToolNames, ...netsuiteToolNames];

        const systemPromptText = systemPrompt({
          selectedChatModel,
          requestHints,
          netsuiteTools: netsuiteToolNames,
          timezone: userTimezone,
          searchDomains: searchConfig.enabledDomains.map((domain) => ({
            label: domain.label,
            url: getSearchDomainUrl(domain),
            tier: domain.tier,
          })),
        });
        console.log(
          `[NetSuite] System prompt includes ${netsuiteToolNames.length} NetSuite tools`,
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
            enabledSearchDomains: searchConfig.enabledDomains.map(
              (d) => d.label,
            ),
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
          dataStream.write({
            type: "error",
            errorText: errorMessage,
          });
          return;
        }

        // Log model and provider info before calling streamText
        console.log("[Chat] Starting streamText:", {
          provider: userProviderType,
          modelId,
          selectedChatModel,
          hasProvider: !!userProvider,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let result: any;
        try {
          result = streamText({
            model: languageModel,
            system: systemPromptText,
            messages: convertToModelMessages(uiMessages),
            stopWhen: stepCountIs(5),
            experimental_activeTools: activeTools as never,
            experimental_transform: smoothStream({ chunking: "word" }),
            tools: allToolsWithConfig,
            // Apply reasoning/thinking config based on provider
            // Both use similar token budgets (4K) for thinking/reasoning
            ...(modelId === "chat-model-reasoning" && {
              providerOptions:
                userProviderType === "google"
                  ? {
                      google: {
                        thinkingConfig: {
                          thinkingBudget: 4096, // Allocates 4K tokens for thought
                          includeThoughts: true,
                        },
                      },
                    }
                  : {
                      anthropic: {
                        thinking: {
                          type: "enabled",
                          budgetTokens: 4096, // Matches Google's 4K token budget
                        },
                      },
                    },
            }),
            experimental_telemetry: {
              isEnabled: isProductionEnvironment,
              functionId: "stream-text",
            },
            onFinish: async ({ usage }) => {
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
          const errorMessage =
            streamError instanceof Error
              ? streamError.message
              : "Failed to start AI response";
          dataStream.write({
            type: "error",
            errorText: errorMessage,
          });
          return;
        }

        try {
          result.consumeStream();

          dataStream.merge(
            result.toUIMessageStream({
              sendReasoning: true,
            }),
          );
          console.log("[Chat] Stream merged successfully");
        } catch (mergeError) {
          console.error("[Chat] Error merging stream:", mergeError);
          const errorMessage =
            mergeError instanceof Error
              ? mergeError.message
              : "Failed to process AI response";
          dataStream.write({
            type: "error",
            errorText: errorMessage,
          });
          return;
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages }) => {
        await saveMessages({
          messages: messages.map((currentMessage) => ({
            id: currentMessage.id,
            role: currentMessage.role,
            parts: currentMessage.parts,
            createdAt: new Date(),
            chatId: id,
          })),
        });

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
      onError: () => {
        return "Oops, an error occurred!";
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
