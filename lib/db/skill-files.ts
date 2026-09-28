import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import type { SkillFile } from "@/lib/ai/skills/bundle";
import { db } from "@/lib/db/client";
import { userSkillFile } from "@/lib/db/schema";

/** Paths only — enough to list a bundle without carrying its bodies. */
export async function listSkillFilePaths(params: {
  userId: string;
  skillIds: string[];
}): Promise<Record<string, string[]>> {
  if (params.skillIds.length === 0) {
    return {};
  }
  const rows = await db
    .select({
      skillId: userSkillFile.skillId,
      path: userSkillFile.path,
    })
    .from(userSkillFile)
    .where(
      and(
        eq(userSkillFile.userId, params.userId),
        inArray(userSkillFile.skillId, params.skillIds),
      ),
    )
    .orderBy(userSkillFile.path);

  const out: Record<string, string[]> = {};
  for (const row of rows) {
    const existing = out[row.skillId];
    if (existing) {
      existing.push(row.path);
    } else {
      out[row.skillId] = [row.path];
    }
  }
  return out;
}

export async function readSkillFiles(params: {
  userId: string;
  skillId: string;
}): Promise<SkillFile[]> {
  const rows = await db
    .select({ path: userSkillFile.path, content: userSkillFile.content })
    .from(userSkillFile)
    .where(
      and(
        eq(userSkillFile.userId, params.userId),
        eq(userSkillFile.skillId, params.skillId),
      ),
    )
    .orderBy(userSkillFile.path);
  return rows;
}

export async function readSkillFile(params: {
  userId: string;
  skillId: string;
  path: string;
}): Promise<string | null> {
  const [row] = await db
    .select({ content: userSkillFile.content })
    .from(userSkillFile)
    .where(
      and(
        eq(userSkillFile.userId, params.userId),
        eq(userSkillFile.skillId, params.skillId),
        eq(userSkillFile.path, params.path),
      ),
    )
    .limit(1);
  return row?.content ?? null;
}

/** Replaces the whole set, so a file dropped from a bundle is dropped here. */
export async function replaceSkillFiles(params: {
  userId: string;
  skillId: string;
  files: SkillFile[];
}): Promise<void> {
  await db
    .delete(userSkillFile)
    .where(
      and(
        eq(userSkillFile.userId, params.userId),
        eq(userSkillFile.skillId, params.skillId),
      ),
    );
  if (params.files.length === 0) {
    return;
  }
  const now = new Date();
  await db.insert(userSkillFile).values(
    params.files.map((file) => ({
      userId: params.userId,
      skillId: params.skillId,
      path: file.path,
      content: file.content,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

/** A deleted skill takes its references with it. */
export async function deleteSkillFiles(params: {
  userId: string;
  skillIds: string[];
}): Promise<void> {
  if (params.skillIds.length === 0) {
    return;
  }
  await db
    .delete(userSkillFile)
    .where(
      and(
        eq(userSkillFile.userId, params.userId),
        inArray(userSkillFile.skillId, params.skillIds),
      ),
    );
}
