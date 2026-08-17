import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { createGetCurrentConfigTool } from "./ai/tools/get-current-config";
import type {
  createProposeCustomPersonaTool,
  createUpdatePersonaInterviewTool,
} from "./ai/tools/persona-interview";
import type { createReadWebpageTool } from "./ai/tools/read-webpage";
import type { createSearchNetsuiteDocsTool } from "./ai/tools/search-netsuite-docs";
import type { AppUsage } from "./usage";

export type DataPart = { type: "append-message"; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type searchNetsuiteDocsTool = InferUITool<
  ReturnType<typeof createSearchNetsuiteDocsTool>
>;
type readWebpageTool = InferUITool<ReturnType<typeof createReadWebpageTool>>;
type getCurrentConfigTool = InferUITool<
  ReturnType<typeof createGetCurrentConfigTool>
>;
type updatePersonaInterviewTool = InferUITool<
  ReturnType<typeof createUpdatePersonaInterviewTool>
>;
type proposeCustomPersonaTool = InferUITool<
  ReturnType<typeof createProposeCustomPersonaTool>
>;

export type ChatTools = {
  searchNetsuiteDocs: searchNetsuiteDocsTool;
  readWebpage: readWebpageTool;
  getCurrentConfig: getCurrentConfigTool;
  updatePersonaInterview: updatePersonaInterviewTool;
  proposeCustomPersona: proposeCustomPersonaTool;
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
