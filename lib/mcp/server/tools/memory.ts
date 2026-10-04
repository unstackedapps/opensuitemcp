import "server-only";

import { getUserSettings } from "@/lib/db/queries";
import {
  forgetFact,
  recallMemories,
  recallOne,
  rememberFact,
} from "@/lib/documents/memory-actions";
import { resolveNetSuiteAccounts } from "@/lib/netsuite/accounts";
import type { McpPrincipal } from "../authenticate";
import { type McpToolDefinition, toolError, toolResult } from "./types";
import { resolveAccountForPrincipal } from "./workspace";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

/**
 * Only write what a person asked to be remembered.
 *
 * Repeated on every write tool because this is the sentence that keeps the
 * store usable. A model that writes what it inferred fills it with confident
 * guesses, and the person finds out when one is acted on.
 */
const ASKED_FOR_IT =
  "Write only what the person asked you to remember. Do not record what you inferred, what a tool returned, or what seemed useful — a memory nobody asked for is a guess the person has to find and delete.";

function readString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

/** The account a memory is stamped with, and the one memories are read under. */
async function activeAccount(principal: McpPrincipal): Promise<string | null> {
  const settings = await getUserSettings({ userId: principal.userId });
  const accounts = resolveNetSuiteAccounts(settings ?? {});
  return (
    resolveAccountForPrincipal({
      pinnedAccountId: principal.pinnedNetSuiteAccountId,
      settingsAccountId: settings?.netsuiteAccountId,
      fallbackAccountId: accounts[0]?.accountId,
    }) ?? null
  );
}

async function memoryIsOn(principal: McpPrincipal): Promise<boolean> {
  const settings = await getUserSettings({ userId: principal.userId });
  return settings?.memoryEnabled !== false;
}

const MEMORY_OFF =
  "Memory is switched off for this workspace. A person turns it on under Customize -> Memory.";

const remember: McpToolDefinition = {
  name: "osmcp_remember",
  title: "Remember a fact",
  description: `Keep one fact the person asked you to remember, so a later session starts knowing it: how they want figures, which subsidiary is dormant, when their fiscal year starts. ${ASKED_FOR_IT} A memory is a fact — a procedure belongs in osmcp_create_skill and a document a person reads belongs in osmcp_write_artifact. Writing to a \`path\` that already holds a memory replaces it, which is how a fact is corrected. It is kept against the NetSuite account that is connected, so a sandbox fact is never read against production.`,
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Where it lives, relative, e.g. `reporting-style.md` or `subsidiaries/seven.md`. Reuse a path to correct a fact.",
      },
      fact: {
        type: "string",
        description:
          "The fact, in one or two sentences, standalone enough to read a year from now without this conversation.",
      },
    },
    required: ["path", "fact"],
    additionalProperties: false,
  },
  annotations: { title: "Remember a fact", ...WRITE },
  execute: async (args, principal) => {
    if (!(await memoryIsOn(principal))) {
      return toolError(MEMORY_OFF);
    }

    const accountId = await activeAccount(principal);

    const outcome = await rememberFact({
      userId: principal.userId,
      path: readString(args, "path"),
      content: readString(args, "fact"),
      netsuiteAccountId: accountId,
    });

    return outcome.ok
      ? toolResult(
          { path: readString(args, "path"), accountId },
          outcome.message,
        )
      : toolError(outcome.error);
  },
};

const recall: McpToolDefinition = {
  name: "osmcp_recall",
  title: "Recall what is remembered",
  description:
    "Read what this workspace has been asked to remember. Without a `path` it lists every memory readable under the connected account, each with the date it was learned; with one it reads that memory. A memory is something the person said, not something verified — an old one is worth confirming before acting on it.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "One memory's path. Omit to list them all.",
      },
    },
    additionalProperties: false,
  },
  annotations: { title: "Recall what is remembered", ...READ_ONLY },
  execute: async (args, principal) => {
    if (!(await memoryIsOn(principal))) {
      return toolError(MEMORY_OFF);
    }

    const path = readString(args, "path");
    if (path) {
      const entry = await recallOne({ userId: principal.userId, path });
      if (!entry) {
        return toolError(
          `There is no memory at \`${path}\`. Call osmcp_recall without a path for the ones that exist.`,
        );
      }
      return toolResult(
        {
          path: entry.path,
          fact: entry.content,
          learned: entry.updatedAt.toISOString(),
          accountId: entry.netsuiteAccountId,
        },
        entry.content,
      );
    }

    const entries = await recallMemories({
      userId: principal.userId,
      netsuiteAccountId: await activeAccount(principal),
    });
    return toolResult({
      columns: ["path", "fact", "learned", "account"],
      rows: entries.map((entry) => ({
        path: entry.path,
        fact: entry.content,
        learned: entry.updatedAt.toISOString(),
        account: entry.netsuiteAccountId,
      })),
      total: entries.length,
    });
  },
};

const forget: McpToolDefinition = {
  name: "osmcp_forget",
  title: "Forget a fact",
  description:
    "Delete one memory by `path`, when the person says it is wrong or no longer true. Correcting a fact is osmcp_remember to the same path, not a forget and a remember.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The memory's path, as osmcp_recall reports it.",
      },
    },
    required: ["path"],
    additionalProperties: false,
  },
  annotations: {
    title: "Forget a fact",
    ...WRITE,
    destructiveHint: true,
    idempotentHint: true,
  },
  execute: async (args, principal) => {
    if (!(await memoryIsOn(principal))) {
      return toolError(MEMORY_OFF);
    }
    const outcome = await forgetFact({
      userId: principal.userId,
      path: readString(args, "path"),
    });
    return outcome.ok
      ? toolResult({ path: readString(args, "path"), forgotten: true })
      : toolError(outcome.error);
  },
};

export const memoryTools: McpToolDefinition[] = [remember, recall, forget];
