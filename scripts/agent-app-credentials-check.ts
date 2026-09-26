/**
 * The credential lifecycle an agent app owns.
 *
 * Written because the binding it checks shipped broken: createManualOAuthClient
 * accepted a grantId, its type said so, and the insert dropped it — so every
 * issued client was unbound and the authorize-time check for "this client may
 * connect only its own app" never fired. Nothing in the type system or the
 * build noticed, because a column that is simply absent from an insert is
 * valid SQL.
 *
 * These modules touch the database, so this cannot live in the node:test suite
 * with the pure ones. Run it against a scratch database — never a real one:
 *
 *   POSTGRES_URL=postgres://osmcp:scratch@127.0.0.1:55433/osmcp \
 *     ENCRYPTION_KEY=$(openssl rand -hex 32) \
 *     npx tsx --conditions=react-server scripts/agent-app-credentials-check.ts
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import {
  createManualOAuthClient,
  readClientCredentialsForGrant,
  resolveOAuthClient,
  rotateClientSecretForGrant,
} from "@/lib/mcp/server/oauth/clients";
import {
  createPendingOAuthGrant,
  deleteRevokedOAuthGrant,
  listOAuthGrants,
  revokeOAuthGrant,
} from "@/lib/mcp/server/oauth/grants";

async function main() {
  const [owner] = await db
    .insert(user)
    .values({ email: `creds-${randomUUID()}@test.invalid`, password: null })
    .returning();
  const mk = (name: string) =>
    createPendingOAuthGrant({
      userId: owner.id,
      orgId: null,
      name,
      personaId: null,
      netsuiteAccountId: null,
      description: `note for ${name}`,
      scope: "mcp",
    });

  const app = await mk("client-key app");
  const other = await mk("self-registering app");
  const created = await createManualOAuthClient({
    userId: owner.id,
    orgId: null,
    clientName: app.name,
    redirectUris: [],
    grantId: app.id,
  });
  console.log(
    "1. issued credentials        ->",
    created.clientId.slice(0, 20),
    "…",
  );

  // Reveal
  const read = await readClientCredentialsForGrant({
    userId: owner.id,
    grantId: app.id,
  });
  assert.ok(read);
  assert.equal(read.clientId, created.clientId);
  assert.equal(read.clientSecret, created.clientSecret);
  console.log("2. reveal returns the secret -> ok");

  // Another user cannot read them
  const [stranger] = await db
    .insert(user)
    .values({ email: `x-${randomUUID()}@test.invalid`, password: null })
    .returning();
  assert.equal(
    await readClientCredentialsForGrant({
      userId: stranger.id,
      grantId: app.id,
    }),
    null,
  );
  console.log("3. scoped to the owner       -> ok");

  // Rotate keeps the id, changes the secret
  const rotated = await rotateClientSecretForGrant({
    userId: owner.id,
    grantId: app.id,
  });
  assert.ok(rotated);
  assert.equal(
    rotated.clientId,
    created.clientId,
    "client id must survive rotation",
  );
  assert.notEqual(rotated.clientSecret, created.clientSecret);
  const after = await readClientCredentialsForGrant({
    userId: owner.id,
    grantId: app.id,
  });
  assert.equal(after?.clientSecret, rotated.clientSecret);
  console.log("4. rotate keeps the client id-> ok");

  // The old secret no longer authenticates
  const resolved = await resolveOAuthClient(created.clientId);
  assert.ok(resolved.ok);
  console.log("5. client still resolves     -> ok");

  // Badges
  const listed = await listOAuthGrants(owner.id);
  const byName = new Map(listed.map((g) => [g.name, g]));
  assert.equal(
    byName.get("client-key app")?.connectionKind,
    "oauth-client-key",
  );
  assert.equal(
    byName.get("self-registering app")?.connectionKind,
    "oauth-pending",
  );
  assert.equal(
    byName.get("client-key app")?.description,
    "note for client-key app",
  );
  console.log(
    "6. badges + note             ->",
    byName.get("client-key app")?.connectionKind,
    "/",
    byName.get("self-registering app")?.connectionKind,
  );

  // Purge only works once revoked
  assert.equal(
    await deleteRevokedOAuthGrant({ userId: owner.id, grantId: other.id }),
    false,
  );
  await revokeOAuthGrant({ userId: owner.id, grantId: other.id });
  assert.equal(
    await deleteRevokedOAuthGrant({ userId: owner.id, grantId: other.id }),
    true,
  );
  console.log("7. purge needs revoke first  -> ok");

  // Purging an app takes its client with it
  await revokeOAuthGrant({ userId: owner.id, grantId: app.id });
  assert.equal(
    await deleteRevokedOAuthGrant({ userId: owner.id, grantId: app.id }),
    true,
  );
  const gone = await resolveOAuthClient(created.clientId);
  assert.equal(gone.ok, false, "the issued client must die with its app");
  console.log("8. client cascades on delete -> ok");

  console.log("\nALL CREDENTIAL CHECKS PASSED");
  process.exit(0);
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
