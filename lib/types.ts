import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { createGetCurrentConfigTool } from "./ai/tools/get-current-config";
import type { createReadWebpageTool } from "./ai/tools/read-webpage";
import type { createSearchFolio3Tool } from "./ai/tools/search-folio3";
import type { createSearchNetsuiteDocsTool } from "./ai/tools/search-netsuite-docs";
import type { createSearchTimDietrichTool } from "./ai/tools/search-tim-dietrich";
import type { AppUsage } from "./usage";

export type DataPart = { type: "append-message"; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type searchNetsuiteDocsTool = InferUITool<
  ReturnType<typeof createSearchNetsuiteDocsTool>
>;
type searchTimDietrichTool = InferUITool<
  ReturnType<typeof createSearchTimDietrichTool>
>;
type searchFolio3Tool = InferUITool<ReturnType<typeof createSearchFolio3Tool>>;
type readWebpageTool = InferUITool<ReturnType<typeof createReadWebpageTool>>;
type getCurrentConfigTool = InferUITool<
  ReturnType<typeof createGetCurrentConfigTool>
>;

export type ChatTools = {
  searchNetsuiteDocs: searchNetsuiteDocsTool;
  searchTimDietrich: searchTimDietrichTool;
  searchFolio3: searchFolio3Tool;
  readWebpage: readWebpageTool;
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
