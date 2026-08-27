import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orgUserTag, userOrgTag } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { getOrgUserRole } from "@/lib/org/admin/users";
import { writeOrgAuditLog } from "@/lib/org/audit";

const MAX_TAGS_PER_USER = 32;
const MAX_TAG_LENGTH = 64;
const TAG_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\s._/-]*$/u;

export type OrgUserTagRow = {
  id: string;
  name: string;
  userCount: number;
};

export function formatUserTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function normalizeUserTagName(name: string): string {
  return formatUserTagName(name).toLowerCase();
}

export function assertValidUserTagName(name: string): string {
  const formatted = formatUserTagName(name);
  if (formatted.length === 0) {
    throw new ChatSDKError("bad_request:database", "Tag name is required.");
  }
  if (formatted.length > MAX_TAG_LENGTH) {
    throw new ChatSDKError(
      "bad_request:database",
      `Tag name must be ${MAX_TAG_LENGTH} characters or fewer.`,
    );
  }
  if (!TAG_NAME_PATTERN.test(formatted)) {
    throw new ChatSDKError(
      "bad_request:database",
      "Tags may use letters, numbers, spaces, and . _ / -",
    );
  }
  return formatted;
}

function dedupeTagNames(tagNames: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawName of tagNames) {
    const formatted = formatUserTagName(rawName);
    if (!formatted) {
      continue;
    }
    const normalized = normalizeUserTagName(formatted);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(formatted);
  }

  return result;
}

export async function listOrgUserTags(orgId: string): Promise<OrgUserTagRow[]> {
  try {
    const rows = await db
      .select({
        id: orgUserTag.id,
        name: orgUserTag.name,
        userCount: sql<number>`count(${userOrgTag.userId})::int`,
      })
      .from(orgUserTag)
      .leftJoin(userOrgTag, eq(userOrgTag.tagId, orgUserTag.id))
      .where(eq(orgUserTag.orgId, orgId))
      .groupBy(orgUserTag.id, orgUserTag.name)
      .orderBy(orgUserTag.name);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      userCount: row.userCount,
    }));
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to list user tags.");
  }
}

async function findOrCreateOrgUserTag({
  orgId,
  name,
}: {
  orgId: string;
  name: string;
}): Promise<string> {
  const formatted = assertValidUserTagName(name);
  const nameNormalized = normalizeUserTagName(formatted);

  const [existing] = await db
    .select({ id: orgUserTag.id })
    .from(orgUserTag)
    .where(
      and(
        eq(orgUserTag.orgId, orgId),
        eq(orgUserTag.nameNormalized, nameNormalized),
      ),
    )
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [created] = await db
    .insert(orgUserTag)
    .values({
      orgId,
      name: formatted,
      nameNormalized,
    })
    .returning({ id: orgUserTag.id });

  if (!created) {
    throw new ChatSDKError("bad_request:database", "Failed to create tag.");
  }

  return created.id;
}

export async function setOrgUserTags({
  orgId,
  actorUserId,
  userId,
  tagNames,
}: {
  orgId: string;
  actorUserId: string;
  userId: string;
  tagNames: string[];
}): Promise<void> {
  const role = await getOrgUserRole(orgId, userId);
  if (!role) {
    throw new ChatSDKError("bad_request:database", "User not in organization.");
  }

  const uniqueNames = dedupeTagNames(tagNames);
  if (uniqueNames.length > MAX_TAGS_PER_USER) {
    throw new ChatSDKError(
      "bad_request:database",
      `Users may have at most ${MAX_TAGS_PER_USER} tags.`,
    );
  }

  for (const name of uniqueNames) {
    assertValidUserTagName(name);
  }

  const tagIds: string[] = [];
  for (const name of uniqueNames) {
    const tagId = await findOrCreateOrgUserTag({ orgId, name });
    tagIds.push(tagId);
  }

  await db.delete(userOrgTag).where(eq(userOrgTag.userId, userId));

  if (tagIds.length > 0) {
    await db.insert(userOrgTag).values(
      tagIds.map((tagId) => ({
        userId,
        tagId,
      })),
    );
  }

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "user.tags_update",
    targetType: "user",
    targetId: userId,
    metadata: { tags: uniqueNames },
  });
}

export async function listOrgUserTagsByUserIds({
  orgId,
  userIds,
}: {
  orgId: string;
  userIds: string[];
}): Promise<Map<string, string[]>> {
  const tagsByUser = new Map<string, string[]>();
  if (userIds.length === 0) {
    return tagsByUser;
  }

  const rows = await db
    .select({
      userId: userOrgTag.userId,
      name: orgUserTag.name,
    })
    .from(userOrgTag)
    .innerJoin(orgUserTag, eq(userOrgTag.tagId, orgUserTag.id))
    .where(
      and(inArray(userOrgTag.userId, userIds), eq(orgUserTag.orgId, orgId)),
    )
    .orderBy(orgUserTag.name);

  for (const row of rows) {
    const tags = tagsByUser.get(row.userId) ?? [];
    tags.push(row.name);
    tagsByUser.set(row.userId, tags);
  }

  return tagsByUser;
}
