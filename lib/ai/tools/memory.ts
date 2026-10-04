import "server-only";

import { tool } from "ai";
import { z } from "zod";
import {
  forgetFact,
  recallMemories,
  rememberFact,
} from "@/lib/documents/memory-actions";

type MemoryToolOptions = {
  userId: string;
  /** The account a new memory is stamped with, and the one reads are scoped to. */
  netsuiteAccountId: string | null;
};

const ASKED_FOR_IT =
  "Write only what the person asked you to remember. Do not record what you inferred, what a tool returned, or what seemed useful — a memory nobody asked for is a guess they have to find and delete.";

export function createRememberTool({
  userId,
  netsuiteAccountId,
}: MemoryToolOptions) {
  return tool({
    description: `Keep one fact the person asked you to remember, so a later conversation starts knowing it. ${ASKED_FOR_IT} A memory is a fact — a procedure belongs in a skill, and a document they read belongs in an artifact. Writing to a path that already holds a memory replaces it, which is how a fact is corrected. It is kept against the NetSuite account that is connected, so a sandbox fact is never read against production.`,
    inputSchema: z.object({
      path: z
        .string()
        .describe(
          "Where it lives, relative, e.g. `reporting-style.md`. Reuse a path to correct a fact.",
        ),
      fact: z
        .string()
        .describe(
          "The fact, in one or two sentences, standalone enough to read a year from now.",
        ),
    }),
    execute: async ({ path, fact }) => {
      const outcome = await rememberFact({
        userId,
        path,
        content: fact,
        netsuiteAccountId,
      });
      return outcome.ok ? outcome.message : outcome.error;
    },
  });
}

export function createRecallTool({
  userId,
  netsuiteAccountId,
}: MemoryToolOptions) {
  return tool({
    description:
      "List what this workspace has been asked to remember, each with the date it was learned. The memories readable here are already in your instructions; call this when you need the paths, or to check whether something is remembered before offering to remember it again.",
    inputSchema: z.object({}),
    execute: async () => {
      const entries = await recallMemories({ userId, netsuiteAccountId });
      if (entries.length === 0) {
        return "Nothing has been remembered yet.";
      }
      return entries
        .map(
          (entry) =>
            `${entry.path} (learned ${entry.updatedAt.toISOString().slice(0, 10)}): ${entry.content}`,
        )
        .join("\n");
    },
  });
}

export function createForgetTool({ userId }: MemoryToolOptions) {
  return tool({
    description:
      "Delete one memory by path, when the person says it is wrong or no longer true. Correcting a fact is a write to the same path, not a forget and a remember.",
    inputSchema: z.object({
      path: z.string().describe("The memory's path."),
    }),
    execute: async ({ path }) => {
      const outcome = await forgetFact({ userId, path });
      return outcome.ok ? outcome.message : outcome.error;
    },
  });
}
