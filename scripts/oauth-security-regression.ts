/**
 * Token-kind confusion regression check.
 *
 * Access and refresh tokens share one table and one tokenId namespace, and the
 * kind used to be taken from the prefix the caller sent rather than from the
 * stored row. Re-labelling a refresh token `osmcp_at_` therefore produced a
 * working sixty-day MCP credential that survived its own rotation and that
 * reuse detection never saw, because it was never presented to /api/oauth/token.
 *
 * These modules touch the database, so this cannot live in the node:test suite
 * with the pure ones. Run it against a scratch database — never against a real
 * one, since it writes rows:
 *
 *   docker run -d --name osmcp-oauth-scratch -e POSTGRES_USER=osmcp \
 *     -e POSTGRES_PASSWORD=scratch -e POSTGRES_DB=osmcp \
 *     -p 127.0.0.1:55433:5432 postgres:16
 *   POSTGRES_URL=postgres://osmcp:scratch@127.0.0.1:55433/osmcp npx tsx lib/db/migrate.ts
 *   POSTGRES_URL=postgres://osmcp:scratch@127.0.0.1:55433/osmcp \
 *     ENCRYPTION_KEY=$(openssl rand -hex 32) \
 *     npx tsx --conditions=react-server scripts/oauth-security-regression.ts
 *
 * Exits non-zero if any credential is accepted as a kind it is not.
 */

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { createPendingOAuthGrant } from "@/lib/mcp/server/oauth/grants";
import {
  authenticateOAuthAccessToken,
  issueTokenPair,
  rotateRefreshToken,
} from "@/lib/mcp/server/oauth/tokens";

/** Swap the kind prefix, leaving tokenId and secret untouched. */
function reprefix(token: string, to: "at" | "rt"): string {
  return token.replace(/^osmcp_(at|rt)_/, `osmcp_${to}_`);
}

async function main() {
  const [owner] = await db
    .insert(user)
    .values({ email: `poc-${randomUUID()}@test.invalid`, password: null })
    .returning();
  const grant = await createPendingOAuthGrant({
    userId: owner.id,
    orgId: null,
    name: "poc",
    personaId: null,
    netsuiteAccountId: null,
    scope: "mcp",
  });
  const pair = await issueTokenPair({ grantId: grant.id });

  let failures = 0;
  const check = async (name: string, fn: () => Promise<boolean>) => {
    const exploited = await fn();
    console.log(`${exploited ? "EXPLOITABLE" : "safe       "}  ${name}`);
    if (exploited) failures++;
  };

  await check("1a. refresh token used as an MCP access token", async () => {
    const forged = reprefix(pair.refreshToken, "at");
    const result = await authenticateOAuthAccessToken(forged);
    return result.ok;
  });

  await check("1b. access token exchanged as a refresh token", async () => {
    const forged = reprefix(pair.accessToken, "rt");
    const result = await rotateRefreshToken({
      refreshToken: forged,
      clientId: "https://claude.ai/mcp-client",
    });
    return result.ok;
  });

  // Rotate legitimately, then try the retired refresh token on the access path.
  const pair2 = await issueTokenPair({ grantId: grant.id });
  const rotated = await rotateRefreshToken({
    refreshToken: pair2.refreshToken,
    clientId: "https://claude.ai/mcp-client",
  });
  await check(
    "1a'. RETIRED refresh token still authenticates for 60 days",
    async () => {
      const forged = reprefix(pair2.refreshToken, "at");
      const result = await authenticateOAuthAccessToken(forged);
      return result.ok;
    },
  );
  void rotated;

  console.log(`\n${failures} of 3 exploitable`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
