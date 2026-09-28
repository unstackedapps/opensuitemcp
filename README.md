# <img src="./app/icon.svg" alt="OpenSuiteMCP Icon" width="24" height="24" /> <span style="font-weight: 200;">OpenSuite</span>MCP

[![GitHub stars](https://img.shields.io/github/stars/unstackedapps/opensuitemcp?style=social)](https://github.com/unstackedapps/opensuitemcp/stargazers)
[![Release](https://img.shields.io/github/v/release/unstackedapps/opensuitemcp)](https://github.com/unstackedapps/opensuitemcp/releases)
[![License](https://img.shields.io/badge/license-Sustainable%20Use-blue)](./LICENSE)

Source-available **NetSuite MCP client** — chat UI for NetSuite’s AI Connector Service, MCP Standard Tools, Companion prompt library, and SuiteCloud Agent Skills.

Bring your own LLM keys (**Google Gemini**, **Anthropic Claude**, **OpenAI**, or an **OpenAI-compatible** endpoint). Self-host for internal use. Commercial rights reserved by [Unstacked Apps, LLC](https://www.unstackedapps.com/).

**Star this repo** if it helps your NetSuite team — it makes the project discoverable.

**Current release:** [v5.5.0](https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.5.0) · [Changelog](CHANGELOG.md)

<img src="./docs/screenshot-chat.png" alt="OpenSuiteMCP chat UI" width="100%" />

_Main chat UI._

## What’s in 5.6

- **An agent writes skills** — a connected AI researches in your NetSuite account, then saves what it established with `osmcp_create_skill`, revises it with `osmcp_update_skill`, and removes it with `osmcp_delete_skill`
- **A persona carries its skills** — pair any skill to any persona, built-in ones included, on the **Skills** tab of the persona editor. They apply whenever that persona is the one working
- **Clone anything you can read** — a built-in persona, someone else's skill, an organization's skill. The copy is yours to change, and the original is untouched
- **Skills say who wrote them** — the Skills panel credits an agent-written skill, and an agent may revise only its own
- **Deleting tells you what it releases** — removing a skill names the personas that carried it; removing a persona leaves its skills in place
- **Markdown renders** — the eye toggle previews a persona or skill as it reads

## What’s in 5.5

- **Agent apps sign in over OAuth 2.1** — every install is its own authorization server. Press **New app** under **App Portal → Agent apps**, paste the Server URL into Claude, Cursor, Gemini or ChatGPT, and approve it on a consent screen here
- **One dialog holds an app** — name, the product it connects from, persona, pinned NetSuite account, note and credential, created and rotated in the same place
- **A credential can be read again** — a bearer token or an OAuth 2.1 client secret is stored encrypted and revealed on demand; a secret rotates in place while the client id stays
- **[Connect an agent](docs/connect-an-agent.md)** — steps for Claude, Cursor, Gemini and ChatGPT

## What’s in 5.4

- **An agent writes personas and chooses which one it is** — `osmcp_create_persona`, `osmcp_update_persona`, `osmcp_delete_persona` and `osmcp_set_agent_persona`; `osmcp_whoami` reports the assignment to a fresh connection
- **NetSuite's prompt library reaches an agent** — `osmcp_list_prompts` and `osmcp_get_prompt` read the Companion SuiteApp's prompts live from the account
- **An agent's work appears as a thread** — `osmcp_create_chat` and `osmcp_append_chat` write into its owner's sidebar, with reasoning and tool calls rendered as this app renders its own
- **A long result opens beside the conversation** — NetSuite output and generated scripts take a resizable pane with copy and download (desktop)

## What’s in 5.3

- **Agent access** — OpenSuiteMCP acts as an MCP server, so an external AI works inside a user's NetSuite workspace as that user
- **Per-user agent keys** — **App Portal → Agent access** mints keys, shown once and stored as a SHA-256 digest, each pinnable to one NetSuite account
- **NetSuite tool passthrough** — every allowed NetSuite MCP Standard Tool re-exposed with its JSON Schema forwarded verbatim, plus the `osmcp_*` workspace tools
- **Org control** — **Admin → Agent access** turns it on for an organization and can narrow it to named members

## What’s in 5.2

- **Skill invocation modes** — Auto, Slash command, or Off for Oracle, Community, Connected, and Custom skills
- **Richer chat turns** — thinking chips, per-turn usage, and prettier MCP tool output (including SuiteQL)

## What’s in 5.0

- **Organization admin** — Org vs solo install modes, `/setup` bootstrap, centralized LLM providers, NetSuite MCP/OIDC policies, skills, search, personas, and user management
- **Post-install onboarding** — Step-by-step wizard for solo and org users (LLM, MCP, OIDC, search, skills) with optional steps and skip support
- **NetSuite OIDC login** — Separate app-login OAuth from MCP connect; per-account test connection, redirect URI copy fields, and setup guide
- **Per-account MCP UX** — DCR probing, integration setup, and OAuth connect per connection (settings, onboarding, and admin)
- **Cross-platform bootstrap** — Node-based local orchestrator (`bootstrap:local`, `reset:backend`) replaces bash-only setup scripts
- **Personas, skills, and providers** — Persona interview builder; Oracle, Community, Connected, and custom skills; multiple named AI providers per chat
- **BYOLLM** — Your API keys; no shared multi-tenant model account in this app

## Personas

Open **Personas** from the App Portal or the header badge on a new chat. Pick a built-in specialist or **Create my own…** to run the interview builder (guided chat that drafts a custom persona playbook).

Built-in personas ship in `.personas/*.md` in this repo. Custom personas are stored per user in Postgres.

Pair skills to a persona on the **Skills** tab of its editor — built-in personas included, where the tab is the only part you can change. A paired skill applies whenever that persona is the one working, even when its mode is **Slash**.

**Clone** copies a persona, including the skills it carries.

## Skills

Open **Skills** from the App Portal (or the sidebar). Four sources, three invocation modes:

| Source | Default | How it works |
| --- | --- | --- |
| **Oracle** | Off | Shared pack; Auto / Slash / Off. Core AI Connector instructions stay Auto. |
| **Community** | Off | Shared pack from [opensuitemcp-community-skills](https://github.com/unstackedapps/opensuitemcp-community-skills); Auto / Slash / Off |
| **Connected** | Slash | Paste a public GitHub repo/folder URL; Auto / Slash / Off |
| **Custom** | Auto | Paste/import custom `SKILL.md`; Auto / Slash / Off |

**Auto** is injected for new messages. **Slash** only when you type `/skill-name`. **Off** is never injected. Composer `/` lists Auto and Slash skills. Modes apply to **new** messages, not as a per-thread override.

A skill written by a connected agent is credited to the agent and starts as **Slash**, so it applies when you invoke it or when a persona carrying it is working. A skill you add yourself starts as **Auto**.

**Clone** copies any skill — including one your organization published — into one you own.

Shared packs are **not** vendored in git. Sync them with:

```bash
pnpm skills:sync
```

That downloads Oracle’s [agent-skills](https://github.com/oracle/netsuite-suitecloud-sdk/tree/master/packages/agent-skills) into `.data/oracle-skills` (or `ORACLE_SKILLS_DIR`) and Community skills into `.data/community-skills` (or `COMMUNITY_SKILLS_DIR`). Run after setup, on deploy (production entrypoint), and on a **weekly cron**. New upstream skills appear as Off until you set a mode; removed upstream skills are pruned. Optional: `GITHUB_TOKEN` for higher GitHub API limits.

**Connected** examples:

- `https://github.com/mattpocock/skills/tree/main/skills/productivity`
- `owner/repo` shorthand

Public repos only in v1. Synced files live under `.data/connected-skills/<userId>/…`.

<img src="./docs/screenshot-skills.png" alt="OpenSuiteMCP Skills panel" width="100%" />

_Skills panel — Oracle, Community, Connected, and Custom._

## Prompts

Open **Prompts** for the Companion SuiteApp library (requires NetSuite connected with Companion available). Filter by category, industry, or role; open a template; fill required placeholders; then use it in chat.

<img src="./docs/screenshot-prompts.png" alt="OpenSuiteMCP Prompts library" width="100%" />

_Companion prompt library — browse and fill-in._

Docs: [Companion SuiteApp](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_9091153093.html)

## NetSuite MCP tools

With AI Connector + MCP Standard Tools connected, chat can run SuiteQL, records, reports, saved searches, and related MCP tools against your account.

<img src="./docs/screenshot-netsuite-tools.png" alt="OpenSuiteMCP NetSuite MCP tools in chat" width="100%" />

_NetSuite MCP tools in a conversation._

## MCP server (act on behalf of a user)

OpenSuiteMCP can also be an **MCP server**, so an external AI agent works
inside a user's NetSuite workspace as that user — their connected account,
their permissions, their tool policy.

Create the app under **App Portal → Agent apps → New app**, choosing how it
connects:

- **OAuth 2.1** — every install is its own OAuth 2.1 authorization server, so the
  client needs nothing but the URL. It sends you here to approve the app, then
  refreshes its own token.
- **Bearer auth** — a token in a header, for an app with no person behind it, a
  client with no OAuth support, or an install that is not on HTTPS.

Either way the app reaches exactly what you have enabled in OpenSuiteMCP — the
credential adds no gate of its own — and both appear in one list you can rename,
re-role and revoke. The server URL derives from your install's public address,
so self-hosted, sandbox and hosted installs each have their own and none of them
depend on the others.

The exact thing to paste, per client, is in
[Connect an agent](docs/connect-an-agent.md). Protocol and tool reference:
[MCP server](docs/mcp-server.md).

## Prerequisites

- Node.js 22+ and [pnpm](https://pnpm.io)
- Docker ([Docker Desktop](https://www.docker.com/products/docker-desktop/) on macOS/Windows, or Docker Engine on Linux) for local PostgreSQL, Redis, and SearXNG via `pnpm setup:backend`
- **An active NetSuite user who can sign in** — the person who completes first-run setup must have a working NetSuite login today:
  - **Organization:** `OSMCP_ROOT_EMAIL` must be that user’s NetSuite email; they sign in on `/setup` via NetSuite OIDC (recommended) or local password with the same email
  - **Solo:** use NetSuite sign-in on `/login` with an account you can access now (local email/password is optional, but you still need NetSuite for MCP connect)
- A NetSuite account with:
  - [AI Connector Service](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_7200233106.html) enabled
  - [MCP Standard Tools](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_0902023450.html) SuiteApp
  - [Companion SuiteApp](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_9091153093.html) if you want the prompt library
- An LLM API key — **Google Gemini**, **Anthropic Claude**, **OpenAI**, or any **OpenAI-compatible** HTTPS endpoint (custom base URL + key)

## Quick Start

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Run automated setup**

   ```bash
   pnpm bootstrap:local
   ```

   Or run the steps manually (`pnpm setup:backend`, then `pnpm skills:sync`, `pnpm db:migrate`, `pnpm dev`).

   `setup:backend` generates secrets, asks **organization vs solo** install mode, and writes:

   - `.env.local` — app / migrate vars (`POSTGRES_URL`, `REDIS_URL`, `AUTH_SECRET`, `OSMCP_INSTALL_MODE`, etc.)
   - `docker/.env` — Compose vars (`PROJECT_NAME`, `POSTGRES_PW`, `REDIS_PW`); gitignored

   | Install mode | Set in `.env.local` | First-run experience |
   | --- | --- | --- |
   | **Organization** (default prompt) | `OSMCP_INSTALL_MODE=org` and `OSMCP_ROOT_EMAIL` (active NetSuite user email) | `/setup` until org owner exists |
   | **Solo** (consultant / individual) | `OSMCP_INSTALL_MODE=solo` | `/login` — NetSuite sign-in or local email/password |

   For org installs, NetSuite OIDC login is optional during setup (account ID + client ID). You can enter them on `/setup` instead. See [NetSuite OIDC login](docs/netsuite-oidc-login.md). MCP account connect in the App Portal is separate (different OAuth integration and callback).

   The script can start Docker services (PostgreSQL, Redis, SearXNG). If Docker was not running during setup, start Docker Desktop/Engine, then:

   ```bash
   docker compose --env-file docker/.env -f docker/docker-compose.yml -p opensuitemcp up -d
   ```

   Use your project name instead of `opensuitemcp` if you chose a custom name during setup.

   **Fresh reset (local dev):** `pnpm reset:backend` — tears down Docker volumes, removes env files, waits briefly, then runs full bootstrap and starts `dev`. To only tear down without reinstalling: `pnpm teardown:backend`.

3. **Sync Oracle + Community skills** (included in `bootstrap:local`; run manually if you used `setup:backend` alone)

   ```bash
   pnpm skills:sync
   ```

4. **Migrate the database**

   ```bash
   pnpm db:migrate
   ```

5. **Start the dev server**

   ```bash
   pnpm dev
   ```

   Uses webpack by default (Turbopack can fail resolving `@ai-sdk/provider-utils` dynamic imports). Optional: `pnpm dev:turbo` if you want to try Turbopack.

   App: [http://localhost:3000](http://localhost:3000)

6. **First sign-in**

   The installer must be an **active NetSuite user** — locked, inactive, or wrong-email accounts cannot complete OIDC sign-in.

   **Organization install** — open the app; you are redirected to `/setup`.

   - **NetSuite (recommended):** follow [NetSuite OIDC login](docs/netsuite-oidc-login.md), enter account ID and client ID on `/setup`, then sign in with NetSuite. The NetSuite user must be able to log in and their email must match `OSMCP_ROOT_EMAIL`.
   - **Local password (legacy):** use the password form on `/setup` with the same email as `OSMCP_ROOT_EMAIL`.

   After bootstrap you are org **owner**. Open **Admin** from the sidebar (owners and admins) to manage users, providers, NetSuite accounts, and skills (Admin CRUD ships in a later phase; shell is available now).

   **Solo install** — open the app; you land on `/login`. Use **NetSuite** to register OIDC and sign in with an account you can access now, or **Email** for a local account. Full NetSuite steps: [NetSuite OIDC login](docs/netsuite-oidc-login.md).

7. **Configure in the App Portal** (sidebar icons open the same portal)

   - **AI Provider** — Add Google, Anthropic, OpenAI, or a custom OpenAI-compatible endpoint and API key (stored encrypted)
   - **NetSuite** — Add an account ID, complete Integration / DCR setup, connect
   - **Personas** — Pick a built-in specialist or create a custom persona
   - **Skills** — Enable Oracle, Community, and/or custom skills; connect GitHub packs for `/` slash skills
   - **Prompts** — Browse Companion templates when NetSuite + Companion are available

## Install environment variables

Written by `pnpm setup:backend` (or set manually for production):

| Variable | Org | Solo | Purpose |
| --- | --- | --- | --- |
| `OSMCP_INSTALL_MODE` | `org` | `solo` | Locks first-run to `/setup` or `/login` |
| `OSMCP_ROOT_EMAIL` | Required | — | Active NetSuite user email; only this user can become org owner on `/setup` |
| `OSMCP_NS_ACCOUNT_ID` | Optional | Optional | NetSuite account for OIDC app login |
| `OSMCP_NS_OIDC_CLIENT_ID` | Optional | Optional | OIDC integration client ID for app login |
| `OSMCP_ENABLE_GUEST` | — | — | Set `true` only for demo/e2e; guest auto-login is off by default |

Upgrading an existing install with users already in the database: see [docs/org-admin-upgrade.md](docs/org-admin-upgrade.md).

## NetSuite setup (short)

1. In NetSuite, ensure AI Connector and the MCP Standard Tools SuiteApp are available for your account.
2. In OpenSuiteMCP → **NetSuite**, add your account ID (e.g. `1234567` or `1234567-sb1`).
3. Follow the in-app Integration instructions (admin once per account), then **Connect** (MCP OAuth — scope **mcp**, callback `/api/netsuite/callback`).
4. Confirm the header status chip shows connected before running SuiteQL / record tools.

**App login vs MCP connect:** [NetSuite OIDC login](docs/netsuite-oidc-login.md) is a separate integration (OIDC Provider, callback `/api/auth/netsuite/callback`). MCP connect in the portal uses the MCP integration only (callback `/api/netsuite/callback`).

Official references:

- [AI Connector Service](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_7200233106.html)
- [MCP Standard Tools](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_0902023450.html)
- [Companion SuiteApp](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_9091153093.html)
- [SuiteCloud Agent Skills](https://github.com/oracle/netsuite-suitecloud-sdk/tree/master/packages/agent-skills)

## Usage limits (optional)

Self-host defaults are generous. Override with env vars if needed:

| Variable | Default (OSS) | Purpose |
| --- | --- | --- |
| `MAX_MESSAGES_PER_DAY_REGULAR` | `100` | Signed-in user messages / 24h |
| `MAX_MESSAGES_PER_DAY_GUEST` | `20` | Guest messages / 24h (only if `OSMCP_ENABLE_GUEST=true`) |
| `CHAT_BURST_LIMIT_PER_MINUTE` | unset / `0` (off) | Redis burst cap; fail-open if Redis is down |
| `MCP_CALL_LIMIT_PER_MINUTE` | unset / `0` (off) | Per-API-key MCP tool calls / minute; fail-open if Redis is down |

Guest auto-login is **disabled** unless `OSMCP_ENABLE_GUEST=true`. Normal self-host and org installs require sign-in.

## Contributors

- [Caleb Moore](https://github.com/devszilla)
- [Steven Scheppelman](https://github.com/scheppsr77)

Third-party libraries and templates are listed in [ATTRIBUTION.md](ATTRIBUTION.md).

## License & notices

**Free:** your organization may self-host for its own internal use. **Paid:** commercial delivery, paid implementation, or paid support of this product — only via [Unstacked Apps](https://www.unstackedapps.com/) (`support@unstackedapps.com`). Third parties may not charge to implement or commercially support this codebase.

After go-live, update via release tags — see [docs/upgrades](https://opensuitemcp.com/docs/upgrades).

- [LICENSE](LICENSE) — Sustainable Use License
- [NOTICE.md](NOTICE.md) — Usage notice
- [ATTRIBUTION.md](ATTRIBUTION.md) — Third-party credits
- [CHANGELOG.md](CHANGELOG.md) — Release history

Hosted product (separate from this repo): [opensuitemcp.com](https://opensuitemcp.com)
