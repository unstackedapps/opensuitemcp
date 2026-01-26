import type { ModelMessage } from "ai";

export const TEST_PROMPTS: Record<string, ModelMessage> = {
  USER_SKY: {
    role: "user",
    content: [{ type: "text", text: "Why is the sky blue?" }],
  },
  USER_GRASS: {
    role: "user",
    content: [{ type: "text", text: "Why is grass green?" }],
  },
  USER_THANKS: {
    role: "user",
    content: [{ type: "text", text: "Thanks!" }],
  },
  USER_NEXTJS: {
    role: "user",
    content: [
      { type: "text", text: "What are the advantages of using Next.js?" },
    ],
  },
  USER_IMAGE_ATTACHMENT: {
    role: "user",
    content: [
      {
        type: "file",
        mediaType: "...",
        data: "...",
      },
      {
        type: "text",
        text: "Who painted this?",
      },
    ],
  },
};
