import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export type DurableMcpTool = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  _meta?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
};

export type DurableMcpToolsCatalog = {
  fetchedAt: number;
  tools: DurableMcpTool[];
};

function catalogPath(userId: string, accountId: string): string {
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeAccount = accountId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(
    process.cwd(),
    ".data",
    "mcp-tools",
    `${safeUser}__${safeAccount}.json`,
  );
}

export async function readDurableMcpTools(
  userId: string,
  accountId: string,
): Promise<DurableMcpToolsCatalog | null> {
  try {
    const raw = await readFile(catalogPath(userId, accountId), "utf8");
    const parsed = JSON.parse(raw) as DurableMcpToolsCatalog;
    if (
      !(
        parsed &&
        typeof parsed.fetchedAt === "number" &&
        Array.isArray(parsed.tools) &&
        parsed.tools.length > 0
      )
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeDurableMcpTools(
  userId: string,
  accountId: string,
  tools: DurableMcpTool[],
  fetchedAt: number = Date.now(),
): Promise<void> {
  if (tools.length === 0) {
    return;
  }
  try {
    const filePath = catalogPath(userId, accountId);
    await mkdir(path.dirname(filePath), { recursive: true });
    const payload: DurableMcpToolsCatalog = { fetchedAt, tools };
    await writeFile(filePath, JSON.stringify(payload), "utf8");
  } catch (error) {
    console.warn(
      "[NetSuite] Failed to persist tools/list catalog:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function deleteDurableMcpTools(
  userId: string,
  accountId?: string | null,
): Promise<void> {
  if (!accountId?.trim()) {
    return;
  }
  try {
    await unlink(catalogPath(userId, accountId.trim()));
  } catch {
    // Missing file is fine
  }
}
