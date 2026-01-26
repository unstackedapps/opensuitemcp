import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { createGetCurrentConfigTool } from "./ai/tools/get-current-config";
import type { createListSearchDomainsTool } from "./ai/tools/list-search-domains";
import type { createReadWebpageTool } from "./ai/tools/read-webpage";
import type { createWebSearchTool } from "./ai/tools/web-search";
import type { AppUsage } from "./usage";

export type DataPart = { type: "append-message"; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type webSearchTool = InferUITool<ReturnType<typeof createWebSearchTool>>;
type readWebpageTool = InferUITool<ReturnType<typeof createReadWebpageTool>>;
type listSearchDomainsTool = InferUITool<
  ReturnType<typeof createListSearchDomainsTool>
>;
type getCurrentConfigTool = InferUITool<
  ReturnType<typeof createGetCurrentConfigTool>
>;

export type ChatTools = {
  webSearch: webSearchTool;
  readWebpage: readWebpageTool;
  listSearchDomains: listSearchDomainsTool;
  getCurrentConfig: getCurrentConfigTool;
};

export type CustomUIDataTypes = {
  appendMessage: string;
  usage: AppUsage;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;
