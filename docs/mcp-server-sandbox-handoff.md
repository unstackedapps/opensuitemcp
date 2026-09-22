# MCP server — sandbox deploy handoff

**WIP-only document. Do not promote to the public repo.**

**Both PRs are merged.** Deploy from the integration branches:

| Repo | Ref to deploy | Merge |
| --- | --- | --- |
| `opensuitemcp-wip` | `develop` (`096b678`) | opensuitemcp-wip#5 |
| `opensuitemcp-hosted` | `main` (`94a2760`) | opensuitemcp-hosted#5 |

Post-merge CI on `develop` is green.

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

## 2. Blockers

One is resolved; two are server-local and still open.

### 2a. The overlay replaces `middleware.ts` — RESOLVED, just pull it

`Dockerfile.sandbox` copies `opensuitemcp-hosted/overlay/` over the OSS tree, and
`overlay/middleware.ts` replaces the OSS file wholesale. The bypass added on the
OSS side therefore had no effect on the hosted image: `/api/mcp` reached
`isAppPublicPath()`, was not listed, and redirected to `/login`, leaving the MCP
server unreachable regardless of the credential presented.

Fixed in opensuitemcp-hosted#5, now on `main`. Nothing to apply by hand —
`git pull` in the hosted clone (step 3a) is enough.

Verified by assembling the image tree the way `Dockerfile.sandbox` builds it and
exercising it before and after:

| | `/api/mcp` POST | `/.well-known/oauth-protected-resource` |
| --- | --- | --- |
| overlay before the fix | `307` -> `/login` | `307` -> `/login` |
| overlay on `main` now | `401` + RFC 9728 challenge | `200` + metadata document |

Correct on both hosts with the host split enabled, with no cross-host redirect,
and `/api/settings` and `/api/history` still redirect — the bypass did not widen.

If a sandbox request to `/api/mcp` returns `307` to `/login`, the hosted clone is
behind; re-pull it.

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

### 3a. Get the code onto the server

The sandbox image builds from `opensuitemcp/` — the **OSS** clone, not the wip
clone. This work is merged to wip `develop` but not yet promoted to public, so
fetch `develop` directly from the wip remote.

Record the current ref first, so rollback is a checkout:

```bash
cd docker/stacks/public/opensuitemcp && git rev-parse --abbrev-ref HEAD
```

```bash
cd docker/stacks/public/opensuitemcp
git remote add wip https://github.com/unstackedapps/opensuitemcp-wip.git 2>/dev/null || true
git fetch wip develop
git checkout -B mcp-sandbox wip/develop
```

Re-running those three lines is also how you pick up later fixes.

`develop` carries WIP-only files — this document, `docs/getting-started.md`,
`.github/workflows/ci.yml`, `scripts/smoke-dev.sh`. The runner stage is
`COPY --from=builder /app /app`, so they do land in the image, but none of them
sit under a served path (`app/` routes and `public/` only), so nothing is
exposed. They are removed at promotion, not here.

Then the overlay, which carries the fix from 2a:

```bash
cd docker/stacks/public/opensuitemcp-hosted && git pull --ff-only
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
cd ../opensuitemcp && git checkout <the ref recorded in 3a>
cd ../opensuitemcp-hosted && git checkout f640e02   # overlay before the MCP fix
```

Migration `0025` only adds two tables and is additive; leaving them in place is
harmless and no down migration is needed. Revoked and unused `McpApiKey` rows
carry no risk once `OSMCP_MCP_SERVER_ENABLED` is unset, since the flag is
checked before any credential is read.

---

## 6. Road to public release

The goal is v5.3.0 tagged on the public repo with the hosted overlay built
against it. Promotion mechanics are already in good shape; three product gaps
are not.

### Promotion is a single cherry-pick

Product and WIP-only changes were kept in separate commits, so nothing has to be
untangled:

| Commit | Contents | Promote? |
| --- | --- | --- |
| `3a6a116` | Feature only — schema, migration, `lib/mcp/server/`, routes, UI, README, CHANGELOG | Yes |
| `6c1c43e` | `docs/getting-started.md`, `docs/mcp-server-sandbox-handoff.md` | Never |
| this commit | `docs/mcp-server-sandbox-handoff.md` | Never |

So: `git checkout -b promote/v5.3.0 public/main && git cherry-pick 3a6a116`.
Confirm the PR touches no WIP-only path before merging.

### Gap 1 — org admins cannot turn the feature on (blocking for org installs)

`app/admin/` has no MCP panel. The policy API (`/api/admin/mcp-policy`) ships,
but nothing calls it. Org installs default to `enabled: false`, and
`docs/mcp-server.md` tells members to "ask an administrator to enable it" —
an administrator who has no button.

Solo installs, including the hosted flavor, are unaffected: they resolve to the
permissive policy. So this does not block sandbox, and it does not block the
hosted product. It does block a clean public release, because org admin is a
headline 5.0 feature and this ships half a feature into it.

Either add the panel beside `app/admin/skills`, or document the `curl` an
admin must run and say plainly that the UI lands next release.

### Gap 2 — `/docs/mcp-server` does not exist

The protected-resource metadata advertises
`resource_documentation: {origin}/docs/mcp-server`, and OSS `middleware.ts`
redirects `/docs/*` to `opensuitemcp.com`. That URL currently 404s for every
install. The hosted docs page has to exist before release, or the field should
be dropped.

### Gap 3 — release metadata not bumped

Nothing here is done yet: `package.json` is `5.2.0`, the README "Current
release" line and feature section still say 5.2, and the CHANGELOG entry sits
under `[Unreleased]`. All three belong in the promotion PR, per the release
checklist in `docs/getting-started.md`.

### Sequence

1. Sandbox passes (section 4), including the two results worth reporting back
2. Close gaps 1-3
3. Consider a security review — this opens a new authenticated network surface
4. Promotion PR to public `main`, version bumped to 5.3.0
5. Tag `v5.3.0` and publish the release
6. Hosted overlay: add the `/docs/mcp-server` page, marketing copy, `llms.txt`,
   sitemap entry, README overlay section, and a hosted CHANGELOG entry reading
   "Built against OpenSuiteMCP **v5.3.0**"; record the rollback image tag
7. Sync wip `main` and `develop` from `public/main`

### Also outstanding

- **34five integration shape.** Their Studio bundle shows a curated marketplace
  with no bring-your-own-server field, so OpenSuiteMCP likely has to be added to
  their catalog rather than pasted in as a URL. Their transport (Streamable HTTP
  vs SSE) is not publicly documented. Both need a conversation with them, and
  neither blocks release.
- **No route-level tests.** `tests/routes/` is Playwright and e2e is disabled in
  CI; the MCP surface is covered by unit tests and manual verification only.
