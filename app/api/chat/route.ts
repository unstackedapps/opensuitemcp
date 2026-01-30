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
import { searchDomains } from "@/lib/ai/search-domains";
import { createGetCurrentConfigTool } from "@/lib/ai/tools/get-current-config";
import { createReadWebpageTool } from "@/lib/ai/tools/read-webpage";
import { createSearchFolio3Tool } from "@/lib/ai/tools/search-folio3";
import { createSearchNetsuiteDocsTool } from "@/lib/ai/tools/search-netsuite-docs";
import { createSearchTimDietrichTool } from "@/lib/ai/tools/search-tim-dietrich";
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
      let titleProvider: "google" | "anthropic" | "openai" = "google";
      if (session.user?.id) {
        try {
          const settings = await getUserSettings({ userId: session.user.id });
          titleProvider =
            (settings?.aiProvider as "google" | "anthropic" | "openai") ||
            "google";
          const apiKeyField =
            titleProvider === "anthropic"
              ? settings?.anthropicApiKey
              : titleProvider === "openai"
                ? settings?.openaiApiKey
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
    let hasErrorOccurred: boolean = false;

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        try {
          // Get user settings (API key, provider, timezone, and maxIterations)
          let userApiKey: string | null = null;
          let userProviderType: "google" | "anthropic" | "openai" = "google";
          let userTimezone = "UTC";
          let userMaxIterations = 10; // Default to 10
          let selectedSearchDomainIds: string[] = [];
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
                userProviderType =
                  (settings.aiProvider as "google" | "anthropic" | "openai") ||
                  "google";
                // Parse maxIterations, default to 10 if invalid
                const maxIterationsValue = settings.maxIterations
                  ? Number.parseInt(settings.maxIterations, 10)
                  : 10;
                userMaxIterations =
                  Number.isNaN(maxIterationsValue) ||
                  maxIterationsValue < 1 ||
                  maxIterationsValue > 20
                    ? 10
                    : maxIterationsValue;

                // Get API key based on selected provider
                const apiKeyField =
                  userProviderType === "anthropic"
                    ? settings.anthropicApiKey
                    : userProviderType === "openai"
                      ? settings.openaiApiKey
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
                    console.error(
                      "[Settings] Error decrypting API key:",
                      error,
                    );
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
            console.error(
              "[Settings] Failed to create provider:",
              errorMessage,
            );
            // Throw error so SDK can handle it
            throw new Error(errorMessage);
          }

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

          // Custom web search tools: only register tools for domains enabled in settings
          const enabledSearchDomainIds = new Set(selectedSearchDomainIds);
          const searchToolEntries: [string, unknown][] = [];
          if (enabledSearchDomainIds.has("oracle-netsuite-help")) {
            searchToolEntries.push([
              "searchNetsuiteDocs",
              createSearchNetsuiteDocsTool(),
            ]);
          }
          if (enabledSearchDomainIds.has("tim-dietrich-blog")) {
            searchToolEntries.push([
              "searchTimDietrich",
              createSearchTimDietrichTool(),
            ]);
          }
          if (enabledSearchDomainIds.has("folio3-netsuite-blog")) {
            searchToolEntries.push(["searchFolio3", createSearchFolio3Tool()]);
          }
          const searchTools = Object.fromEntries(searchToolEntries);

          // Merge base tools with NetSuite tools
          const allTools = {
            ...searchTools,
            readWebpage: createReadWebpageTool(),
            ...netsuiteTools,
          };

          // Build active tools list (tools are enabled in both standard and reasoning modes)
          const netsuiteToolNames = Object.keys(netsuiteTools);
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

          const systemPromptText = systemPrompt({
            selectedChatModel,
            requestHints,
            netsuiteTools: netsuiteToolNames,
            timezone: userTimezone,
            enabledSearchToolNames: Object.keys(searchTools),
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
              enabledSearchDomains: searchDomains
                .filter((d) => enabledSearchDomainIds.has(d.id))
                .map((d) => d.label),
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
                    : userProviderType === "anthropic"
                      ? {
                          anthropic: {
                            thinking: {
                              type: "enabled",
                              budgetTokens: 4096, // Matches Google's 4K token budget
                            },
                          },
                        }
                      : {
                          // OpenAI reasoning configuration for o4-mini
                          openai: {
                            reasoningEffort: "high", // Equivalent to adjusting thinking budget
                            reasoningSummary: "detailed", // Show thought process in UI
                          },
                        },
              }),
              experimental_telemetry: {
                isEnabled: isProductionEnvironment,
                functionId: "stream-text",
              },
              onFinish: async ({ usage, steps }) => {
                // Check if we hit the max iterations limit (exactly equals, not >=)
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
            (userProviderType === "openai" &&
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

        // Filter out empty messages (messages with no parts or empty text parts)
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
