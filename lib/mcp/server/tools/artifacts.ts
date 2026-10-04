import "server-only";

import {
  deleteDocument,
  listDocuments,
  readDocument,
  writeDocument,
} from "@/lib/db/documents";
import { normalizeDocumentPath } from "@/lib/documents/paths";
import { type McpToolDefinition, toolError, toolResult } from "./types";

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
 * Large enough for a reconciliation or a generated script, small enough that a
 * runaway loop fills a panel rather than a disk.
 */
const MAX_ARTIFACT_CONTENT = 1_000_000;
const MAX_ARTIFACT_TITLE = 200;

function readString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

function resolvePath(
  raw: string,
): { ok: true; path: string } | McpToolResultError {
  const result = normalizeDocumentPath(raw);
  if (result.ok) {
    return { ok: true, path: result.path };
  }
  return { ok: false, error: result.message };
}

type McpToolResultError = { ok: false; error: string };

const listArtifacts: McpToolDefinition = {
  name: "osmcp_list_artifacts",
  title: "List artifacts",
  description:
    "List the artifacts in this workspace — documents a session produced and kept, which the person sees under Workspace → Artifacts. Each entry reports its `path`, title, size and when it was last written. Read one with osmcp_get_artifact.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  annotations: { title: "List artifacts", ...READ_ONLY },
  execute: async (_args, principal) => {
    const rows = await listDocuments({
      userId: principal.userId,
      kind: "artifact",
    });
    return toolResult({
      columns: ["path", "title", "bytes", "version", "updatedAt"],
      rows: rows.map((row) => ({
        path: row.path,
        title: row.title,
        bytes: row.bytes,
        version: row.version,
        updatedAt: row.updatedAt.toISOString(),
      })),
      total: rows.length,
    });
  },
};

const getArtifact: McpToolDefinition = {
  name: "osmcp_get_artifact",
  title: "Read an artifact",
  description:
    "Read one artifact in full by its `path`, as reported by osmcp_list_artifacts. Read before writing to the same path: a write replaces what is there.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "The `path` from osmcp_list_artifacts, e.g. `q3-review.md`.",
      },
    },
    required: ["path"],
    additionalProperties: false,
  },
  annotations: { title: "Read an artifact", ...READ_ONLY },
  execute: async (args, principal) => {
    const path = resolvePath(readString(args, "path"));
    if (!path.ok) {
      return toolError(path.error);
    }

    const artifact = await readDocument({
      userId: principal.userId,
      kind: "artifact",
      path: path.path,
    });
    if (!artifact) {
      return toolError(
        `No artifact at \`${path.path}\`. Call osmcp_list_artifacts for the paths that exist.`,
      );
    }

    return toolResult(
      {
        path: artifact.path,
        title: artifact.title,
        version: artifact.version,
        updatedAt: artifact.updatedAt.toISOString(),
        content: artifact.content,
      },
      artifact.content,
    );
  },
};

const writeArtifact: McpToolDefinition = {
  name: "osmcp_write_artifact",
  title: "Write an artifact",
  description:
    "Save a document the person keeps after this session: a reconciliation, a generated script, a summary worth reading twice. It appears under Workspace → Artifacts. Writing to a `path` that already exists replaces it, so read it first with osmcp_get_artifact when revising rather than guessing. Use this for output a person reads; use osmcp_create_skill for a procedure the next agent should follow.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Where it lives, relative, e.g. `q3-review.md` or `vendors/acme.md`. Reuse a path to revise; pick a new one for a new document.",
      },
      title: {
        type: "string",
        description: "What the person sees in the list. Defaults to the path.",
      },
      content: {
        type: "string",
        description: "The document itself. Markdown reads best.",
      },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  annotations: { title: "Write an artifact", ...WRITE },
  execute: async (args, principal) => {
    const path = resolvePath(readString(args, "path"));
    if (!path.ok) {
      return toolError(path.error);
    }

    const content = typeof args.content === "string" ? args.content : "";
    if (!content) {
      return toolError("Pass the `content` of the artifact.");
    }
    if (content.length > MAX_ARTIFACT_CONTENT) {
      return toolError(
        `An artifact cannot be longer than ${MAX_ARTIFACT_CONTENT} characters. Split it across paths.`,
      );
    }

    const title = readString(args, "title").slice(0, MAX_ARTIFACT_TITLE);
    const artifact = await writeDocument({
      userId: principal.userId,
      kind: "artifact",
      path: path.path,
      title: title || null,
      content,
    });

    return toolResult(
      {
        path: artifact.path,
        title: artifact.title,
        version: artifact.version,
        updatedAt: artifact.updatedAt.toISOString(),
      },
      artifact.version === 1
        ? `Saved \`${artifact.path}\`. The person sees it under Workspace -> Artifacts.`
        : `Replaced \`${artifact.path}\`, now version ${artifact.version}.`,
    );
  },
};

const deleteArtifact: McpToolDefinition = {
  name: "osmcp_delete_artifact",
  title: "Delete an artifact",
  description:
    "Delete one artifact by `path`. It is gone; nothing reads an earlier version back. Replacing an artifact is a write to the same path, not a delete and a write.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The `path` from osmcp_list_artifacts.",
      },
    },
    required: ["path"],
    additionalProperties: false,
  },
  annotations: {
    title: "Delete an artifact",
    ...WRITE,
    destructiveHint: true,
    idempotentHint: true,
  },
  execute: async (args, principal) => {
    const path = resolvePath(readString(args, "path"));
    if (!path.ok) {
      return toolError(path.error);
    }

    const deleted = await deleteDocument({
      userId: principal.userId,
      kind: "artifact",
      path: path.path,
    });
    if (!deleted) {
      return toolError(
        `No artifact at \`${path.path}\`. Call osmcp_list_artifacts for the paths that exist.`,
      );
    }

    return toolResult({ path: path.path, deleted: true });
  },
};

export const artifactTools: McpToolDefinition[] = [
  listArtifacts,
  getArtifact,
  writeArtifact,
  deleteArtifact,
];
