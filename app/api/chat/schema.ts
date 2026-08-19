import { z } from "zod";

const textPartSchema = z.object({
  type: z.enum(["text"]),
  text: z.string().min(1).max(2000),
});

const invokedConnectedSkillsPartSchema = z.object({
  type: z.enum(["data-invokedConnectedSkills"]),
  data: z
    .array(
      z.object({
        id: z.string().max(256),
        slug: z.string().max(128),
        name: z.string().max(256),
      }),
    )
    .min(1)
    .max(20),
});

const partSchema = z.discriminatedUnion("type", [
  textPartSchema,
  invokedConnectedSkillsPartSchema,
]);

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: z.object({
    id: z.string().uuid(),
    role: z.enum(["user"]),
    parts: z.array(partSchema),
  }),
  selectedChatModel: z.enum(["chat-model", "chat-model-reasoning"]),
  selectedVisibilityType: z.enum(["public", "private"]),
  aiProviderId: z.string().max(64).optional().nullable(),
  personaId: z.string().max(64).optional().nullable(),
  refiningPersonaId: z.string().max(64).optional().nullable(),
  /** Connected skills invoked via / in the composer for this turn only */
  invokedConnectedSkillIds: z.array(z.string().max(256)).max(20).optional(),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
