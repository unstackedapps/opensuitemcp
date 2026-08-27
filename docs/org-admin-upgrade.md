# Org admin upgrade (existing installs)

This note applies when upgrading an install that already has users, NetSuite
connections, and LLM keys configured before the org admin layer shipped.

## What the migration does

Migrations `0014_org_admin` and `0015_org_bootstrap_data` are **additive only**:

- Creates org-scoped tables (`Org`, `UserRole`, `OrgLlmProvider`, etc.)
- Seeds a single **Default Organization**
- Assigns every existing user `role: member` in that org
- Mirrors existing NetSuite accounts, enabled skills, and in-use LLM provider
  types into org tables (enabled, unlocked)
- Leaves all per-user `UserSettings` and `NetSuiteToken` rows intact

Nothing is deleted or rewritten. Current users keep working after upgrade.

## Required manual step: designate an owner

The migration **cannot** infer who should be org owner on an existing install.

After upgrading, choose one:

### Option A — `OSMCP_ROOT_EMAIL` (recommended)

Set on the next deploy (or before `pnpm db:migrate`):

```bash
OSMCP_INSTALL_MODE=org
OSMCP_ROOT_EMAIL=admin@yourcompany.com
```

If no owner exists yet, migrate promotes that user to `owner`. It does **not**
override an existing owner.

### Option B — database promotion

```sql
UPDATE "UserRole"
SET "role" = 'owner'
WHERE "userId" = (
  SELECT "id" FROM "User" WHERE "email" = 'admin@yourcompany.com'
);
```

Only users with `owner` or `admin` will see the Admin UI once it ships.

## Fresh installs

Run `pnpm setup:backend`. The script generates secrets, starts Docker, and
asks whether this is an **organization** or **solo** install.

| Mode | First-run UX |
| --- | --- |
| `OSMCP_INSTALL_MODE=solo` | `/login` → register or sign in (legacy self-host path) |
| `OSMCP_INSTALL_MODE=org` | `/setup` until org owner exists |

Org installs require `OSMCP_ROOT_EMAIL` at install time. NetSuite OIDC is
optional at install — enter on `/setup` or add later in Admin → OIDC Login.

`OrgNetSuiteAccount` stores **OIDC login** integrations only (app sign-in).
Per-user MCP NetSuite connections stay in `UserSettings` / `NetSuiteToken` and
are not mirrored into org OIDC tables.

```bash
OSMCP_NS_ACCOUNT_ID=1234567
OSMCP_NS_OIDC_CLIENT_ID=your-oidc-integration-client-id
```

Redirect URI for login OAuth:

```text
https://your-app.example.com/api/auth/netsuite/callback
```

Create the NetSuite OIDC Provider integration as described in
[NetSuite OIDC login](netsuite-oidc-login.md). Do not reuse the MCP
integration. MCP connect still uses `/api/netsuite/callback` with scope **mcp**.

First-run `/setup` accepts NetSuite OAuth when OIDC env vars are set, or the
legacy password form. Both paths require the user email to match
`OSMCP_ROOT_EMAIL`.

## Non-default restructuring

Splitting one install into multiple orgs, reassigning historical ownership, or
bulk role changes beyond the default backfill is **out of scope** for the
automated migration. Treat that as a manual / white-glove data migration.

## Session context

After upgrade, users may need to sign out and sign in once so JWT/session
includes `orgId` and `role`. New logins always receive org context.
