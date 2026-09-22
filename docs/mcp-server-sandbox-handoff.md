# MCP server — sandbox deploy handoff

**WIP-only document. Do not promote to the public repo.**

Branch: `feature/caleb/mcp-server-001` · PR: unstackedapps/opensuitemcp-wip#5 · CI: green

Goal: deploy this branch to `app-sandbox.opensuitemcp.com` and verify the MCP
server end to end, because local verification needs Docker, Postgres, and a live
NetSuite connection that the sandbox already has.

---

## 1. Status

### Verified

- `pnpm lint`, `tsc --noEmit`, 167/167 unit tests (32 new)
- CI green on PR #5 — including `pnpm build`, which applied migration `0025`
  against the Postgres service (`Migrations completed in 191 ms`) and emitted
  both `/api/mcp` and `/.well-known/oauth-protected-resource` in the route table
- Live against `next dev`: `404` when the feature flag is off (proving the
  middleware bypass works and it is not a `/login` redirect), `401` with an
  RFC 9728 `WWW-Authenticate` challenge, `405` on GET and DELETE, `403` on a
  cross-origin `Origin`, `503` when the database is unreachable
- Solo installs resolve to the permissive policy: `assignUserToDefaultOrgMember`
  early-returns when `!isOrgInstallMode()`, so `orgId` is `null` and
  `resolveMcpPolicy(null)` returns the solo policy. The hosted image is the solo
  flavor, so there is **no org gate to turn on** in sandbox.

### Not verified — this is what sandbox is for

- Minting a key through the UI, and `tools/list` / `tools/call` with a real key
- NetSuite tool passthrough against a live account
- The **write classifier** against real NetSuite tool names. It derives
  read-vs-write from the tool name because NetSuite does not declare it, and it
  is fail-closed. Misclassification shows up as a missing tool, not a stray
  write.
- Scope enforcement: a read-only key must not list any tool whose
  `annotations.readOnlyHint` is false

---

## 2. Three blockers to clear before deploying

### 2a. The overlay replaces `middleware.ts` — REQUIRED, not yet applied

`Dockerfile.sandbox` copies `opensuitemcp-hosted/overlay/` over the OSS tree,
and `overlay/middleware.ts` replaces the OSS file wholesale. **The bypass added
on this branch does not exist in the hosted image.** Without the patch below,
`/api/mcp` reaches `isAppPublicPath()`, is not listed, and redirects to
`/login` — the MCP server is unreachable on sandbox and production.

Apply to `opensuitemcp-hosted/overlay/middleware.ts`:

```ts
// 1. Add beside the other path helpers, above isAdminAuthPath():

/**
 * The MCP server authenticates with a bearer API key in its own route handler,
 * and its RFC 9728 metadata document must be reachable anonymously. Both must
 * bypass the session gate, or a client handshake is answered with a redirect
 * to /login instead of a protocol response.
 *
 * Kept in sync with the OSS `middleware.ts`, which this file replaces at image
 * build; a bypass added there alone has no effect on the hosted image.
 */
function isMcpServerPath(pathname: string): boolean {
  return (
    pathname === "/api/mcp" ||
    pathname.startsWith("/api/mcp/") ||
    pathname === "/.well-known/oauth-protected-resource" ||
    pathname.startsWith("/.well-known/oauth-protected-resource/")
  );
}
```

```ts
// 2. In middleware(), immediately after the /ping branch and BEFORE the
//    host-split redirects — an MCP client follows redirects poorly:

  if (isMcpServerPath(pathname)) {
    return NextResponse.next();
  }
```

```ts
// 3. In config.matcher, add alongside "/api/:path*":

    "/.well-known/:path*",
```

### 2b. Caddy basic auth will shadow bearer auth

`opensuitemcp-hosted/README.md` states sandbox has HTTP basic auth at Caddy on
both hosts. Basic auth returns `401` before Next.js ever sees the request, so an
MCP client cannot connect regardless of its bearer token — and the failure looks
identical to a bad API key.

Exempt both paths in the sandbox Caddy site block (config is server-local, in
neither repo):

```
@mcp path /api/mcp /api/mcp/* /.well-known/oauth-protected-resource*
basic_auth {
  # existing credentials
}
# ensure @mcp is NOT matched by the basic_auth matcher
```

Exact syntax depends on how the existing block is written — the requirement is
simply that those two paths skip basic auth while everything else keeps it.

### 2c. Migrations do not run at image build

`Dockerfile.sandbox` runs `pnpm exec next build`, **not** `pnpm build`. Only
`pnpm build` chains `tsx lib/db/migrate`. So `0025` is not applied by the build.

`docker/scripts/prod-entrypoint.sh` is server-local and in neither clone, so I
could not confirm whether it runs `db:migrate` on boot. **Confirm this.** If it
does not, run migrations manually after the image is up:

```bash
docker compose -f docker-compose.sandbox.yml exec app npx tsx lib/db/migrate.ts
```

Without it, every key operation fails on a missing `McpApiKey` table — which now
surfaces as a clean `503`, not a bodiless `500`.

---

## 3. Deploy

### 3a. Get the branch onto the server's OSS clone

The sandbox image builds from `opensuitemcp/` — the **OSS** clone, not the wip
clone. This branch is not promoted to public yet, so fetch it directly:

```bash
cd docker/stacks/public/opensuitemcp
git remote add wip https://github.com/unstackedapps/opensuitemcp-wip.git 2>/dev/null || true
git fetch wip feature/caleb/mcp-server-001
git checkout -B mcp-server-001 wip/feature/caleb/mcp-server-001
```

Record the previous ref first so rollback is a checkout:

```bash
git rev-parse --abbrev-ref HEAD   # run BEFORE the checkout above
```

### 3b. Enable the feature in sandbox compose

Add to the `environment:` block of `docker-compose.sandbox.yml`, beside
`DISABLE_SKILLS_PACK_SYNC`:

```yaml
      OSMCP_MCP_SERVER_ENABLED: "true"
      # Optional per-key call budget; needs REDIS_URL, fails open without it.
      MCP_CALL_LIMIT_PER_MINUTE: ${MCP_CALL_LIMIT_PER_MINUTE:-60}
```

The server URL is derived from `AUTH_URL`, so sandbox advertises
`https://app-sandbox.opensuitemcp.com/api/mcp` with no extra configuration.
That derivation is the feature working, not something to override.

### 3c. Build

```bash
cd docker/stacks/public/opensuitemcp-hosted
docker compose -f docker-compose.sandbox.yml up -d --build
```

Note `Dockerfile.sandbox` builds `FROM opensuitemcp-app:latest AS prev` purely
as a `node_modules` cache, and the sandbox image is tagged
`opensuitemcp-sandbox:latest` — it does not retag `opensuitemcp-app`, so
production is untouched.

---

## 4. Sandbox test checklist

Anonymous — should work before any key exists:

```bash
curl -sS https://app-sandbox.opensuitemcp.com/.well-known/oauth-protected-resource
```

Expect `200` and JSON whose `resource` is the sandbox `/api/mcp` URL. A `401`
here means Caddy basic auth (2b). A `307` to `/login` means the overlay
middleware patch (2a) is missing.

```bash
curl -sS -i -X POST https://app-sandbox.opensuitemcp.com/api/mcp \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: tools/list' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -20
```

Expect `401` plus a `WWW-Authenticate: Bearer ... resource_metadata="..."`
header.

Then sign in to the sandbox app, open **App Portal → API access**, confirm the
Server URL shown is the sandbox URL, and mint a **read-only** key.

```bash
export K="osmcp_..."
curl -sS https://app-sandbox.opensuitemcp.com/api/mcp \
  -H "Authorization: Bearer $K" -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: tools/call' \
  -H 'Mcp-Name: osmcp_whoami' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"osmcp_whoami","arguments":{}}}'
```

Expect your own email and active NetSuite account — this is the "acts as a
signed-in user" claim.

**The two results worth capturing and reporting back:**

```bash
curl -sS https://app-sandbox.opensuitemcp.com/api/mcp \
  -H "Authorization: Bearer $K" -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: tools/list' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/list"}' \
  | python3 -c "import json,sys; t=json.load(sys.stdin)['result']['tools']; print(len(t),'tools'); [print('RO' if x['annotations'].get('readOnlyHint') else 'RW', x['name']) for x in t]"
```

1. Every line must read `RO` on a read-only key. Any `RW` is a scope-enforcement
   bug.
2. The tool-name list is the first real test of the write classifier. A read
   tool hidden as write is a usability bug; the reverse would be a security one.

Finally, connect a real client — this exercises an implementation I did not
write:

```bash
claude mcp add --transport http osmcp-sandbox https://app-sandbox.opensuitemcp.com/api/mcp --header "Authorization: Bearer $K"
```

---

## 5. Rollback

```bash
docker compose -f docker-compose.sandbox.yml down
cd ../opensuitemcp && git checkout <previous ref from 3a>
```

Migration `0025` only adds two tables and is additive; leaving them in place is
harmless and no down migration is needed. Revoked and unused `McpApiKey` rows
carry no risk once `OSMCP_MCP_SERVER_ENABLED` is unset, since the flag is
checked before any credential is read.

---

## 6. Still open after sandbox

1. **Hosted overlay product surface** — docs page, marketing copy, `llms.txt`,
   sitemap, `README` overlay section, hosted `CHANGELOG`. Not started; the
   middleware patch in 2a is the only overlay change that is strictly required
   for the feature to function.
2. **Org policy admin panel** — the API (`/api/admin/mcp-policy`) ships on this
   branch; the UI does not. Only affects org installs, so not sandbox-blocking.
3. **34five integration shape** — their Studio bundle shows a curated
   marketplace with no bring-your-own-server field, so OSMCP likely needs to be
   added to their catalog. Their transport (Streamable HTTP vs SSE) is not
   publicly documented. Both need a conversation with them.
4. **Promotion to public** — only after sandbox passes, per
   `docs/getting-started.md`: cherry-pick product commits onto
   `promote/vX.Y.Z` cut from `public/main`, excluding every WIP-only path
   including this file.
