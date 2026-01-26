import { eq } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { netsuiteToken } from "@/lib/db/schema";
import { refreshAccessToken } from "./oauth";

/**
 * Get NetSuite token for a user, refreshing if necessary
 */
export async function getNetSuiteToken(userId: string): Promise<string | null> {
  const [token] = await db
    .select()
    .from(netsuiteToken)
    .where(eq(netsuiteToken.userId, userId))
    .limit(1);

  if (!token) {
    console.log(`[NetSuite] No token found for user: ${userId}`);
    return null;
  }

  console.log(
    `[NetSuite] Found token for user: ${userId}, expires at: ${token.expiresAt}`,
  );

  // Check if token is expired (with 5 minute buffer)
  const now = new Date();
  const expiresAt = new Date(token.expiresAt);
  const buffer = 5 * 60 * 1000; // 5 minutes

  if (expiresAt.getTime() - now.getTime() < buffer) {
    // Token is expired or expiring soon, refresh it
    try {
      const refreshed = await refreshAccessToken({
        userId,
        refreshToken: token.refreshToken,
      });
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

      await db
        .update(netsuiteToken)
        .set({
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
          expiresAt: newExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(netsuiteToken.id, token.id));

      return refreshed.access_token;
    } catch (_error) {
      // If refresh fails, delete the token
      await db.delete(netsuiteToken).where(eq(netsuiteToken.id, token.id));
      return null;
    }
  }

  return token.accessToken;
}

/**
 * Save NetSuite token for a user
 */
export async function saveNetSuiteToken(params: {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + params.expiresIn * 1000);
  const now = new Date();

  // Check if token already exists for this user
  const [existing] = await db
    .select()
    .from(netsuiteToken)
    .where(eq(netsuiteToken.userId, params.userId))
    .limit(1);

  if (existing) {
    // Update existing token
    await db
      .update(netsuiteToken)
      .set({
        accessToken: params.accessToken,
        refreshToken: params.refreshToken,
        expiresAt,
        updatedAt: now,
      })
      .where(eq(netsuiteToken.id, existing.id));
  } else {
    // Create new token
    await db.insert(netsuiteToken).values({
      userId: params.userId,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
  }
}

/**
 * Delete NetSuite token for a user
 */
export async function deleteNetSuiteToken(userId: string): Promise<void> {
  await db.delete(netsuiteToken).where(eq(netsuiteToken.userId, userId));
}
