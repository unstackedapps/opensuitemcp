# <img src="./app/icon.svg" alt="OpenSuiteMCP Icon" width="24" height="24" /> <span style="font-weight: 200;">OpenSuite</span>MCP

[![GitHub stars](https://img.shields.io/github/stars/unstackedapps/opensuitemcp?style=social)](https://github.com/unstackedapps/opensuitemcp/stargazers)
[![Release](https://img.shields.io/github/v/release/unstackedapps/opensuitemcp)](https://github.com/unstackedapps/opensuitemcp/releases)
[![License](https://img.shields.io/badge/license-Sustainable%20Use-blue)](./LICENSE)

Source-available **NetSuite MCP client** — chat UI for NetSuite’s AI Connector Service, MCP Standard Tools, Companion prompt library, and SuiteCloud Agent Skills.

Bring your own LLM keys (**Google Gemini**, **Anthropic Claude**, or **OpenAI GPT**). Self-host for internal use. Commercial rights reserved by [Unstacked Apps, LLC](https://www.unstackedapps.com/).

**Star this repo** if it helps your NetSuite team — it makes the project discoverable.

**Current release:** [v3.1.1](https://github.com/unstackedapps/opensuitemcp/releases/tag/v3.1.1) · [Changelog](CHANGELOG.md)

<img src="./docs/screenshot-chat.png" alt="OpenSuiteMCP chat UI" width="100%" />

_Main chat UI._

## What’s in 3.0

- **App Portal** — Chats, Skills, Prompts, AI Provider, NetSuite, Web Search, Timezone, and Account in one panel
- **SuiteCloud Agent Skills** — Oracle pack + custom `SKILL.md`; toggle into the system prompt per session
- **Companion Prompt Library** — Browse, fill placeholders, send into chat
- **NetSuite MCP** — Multi-account connect (DCR), status chip, live tool calls
- **BYOLLM** — Your API keys; no shared multi-tenant model account in this app

## Skills

Open **Skills** from the App Portal (or the sidebar). Enable Oracle SuiteCloud Agent Skills and/or your own custom skills. Enabled skills are injected into the system prompt for **new** messages — useful for finance analyst workflows, SuiteScript / SDF guidance, OWASP patterns, and more.

Oracle skills are **not** vendored in git. One shared on-disk pack is the source of truth for every user:

```bash
pnpm skills:sync
```

That downloads `SKILL.md` files from Oracle’s [agent-skills](https://github.com/oracle/netsuite-suitecloud-sdk/tree/master/packages/agent-skills) pack into `.data/oracle-skills` (or `ORACLE_SKILLS_DIR`). Run it after setup, on deploy (production entrypoint does this), and on a **weekly cron**. New upstream skills appear as new toggles (off by default); removed upstream skills are pruned. Optional: `GITHUB_TOKEN` for higher GitHub API limits.

Custom skills: add a `SKILL.md`-style document in the portal; toggle it like any Oracle skill.

<img src="./docs/screenshot-skills.png" alt="OpenSuiteMCP Skills panel" width="100%" />

_Skills panel — Oracle pack and custom skills._

## Prompts

Open **Prompts** for the Companion SuiteApp library (requires NetSuite connected with Companion available). Filter by category, industry, or role; open a template; fill required placeholders; then use it in chat.

<img src="./docs/screenshot-prompts.png" alt="OpenSuiteMCP Prompts library" width="100%" />

_Companion prompt library — browse and fill-in._

Docs: [Companion SuiteApp](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_9091153093.html)

## NetSuite MCP tools

With AI Connector + MCP Standard Tools connected, chat can run SuiteQL, records, reports, saved searches, and related MCP tools against your account.

<img src="./docs/screenshot-netsuite-tools.png" alt="OpenSuiteMCP NetSuite MCP tools in chat" width="100%" />

_NetSuite MCP tools in a conversation._

## Prerequisites

- Node.js 22+ and [pnpm](https://pnpm.io)
- Docker ([Docker Desktop](https://www.docker.com/products/docker-desktop/) on macOS/Windows, or Docker Engine on Linux) for local PostgreSQL, Redis, and SearXNG via `pnpm setup:backend`
- A NetSuite account with:
  - [AI Connector Service](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_7200233106.html) enabled
  - [MCP Standard Tools](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_0902023450.html) SuiteApp
  - [Companion SuiteApp](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_9091153093.html) if you want the prompt library
- An API key from Google, Anthropic, or OpenAI

## Quick Start

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Run automated setup**

   ```bash
   pnpm setup:backend
   ```

   Generates secrets and writes:

   - `.env.local` — app / migrate vars (`POSTGRES_URL`, `REDIS_URL`, auth, etc.)
   - `docker/.env` — Compose vars (`PROJECT_NAME`, `POSTGRES_PW`, `REDIS_PW`); gitignored

   It can also start Docker services (PostgreSQL, Redis, SearXNG). If Docker was not running during setup, start Docker Desktop/Engine, then:

   ```bash
   docker compose --env-file docker/.env -f docker/docker-compose.yml -p opensuitemcp up -d
   ```

   Use your project name instead of `opensuitemcp` if you chose a custom name during setup.

3. **Sync Oracle skills**

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

6. **Configure in the App Portal** (sidebar icons open the same portal)

   - **AI Provider** — Choose Google / Anthropic / OpenAI and enter your API key (stored encrypted)
   - **NetSuite** — Add an account ID, complete Integration / DCR setup, connect
   - **Skills** — Enable Oracle and/or custom skills for new messages
   - **Prompts** — Browse Companion templates when NetSuite + Companion are available

## NetSuite setup (short)

1. In NetSuite, ensure AI Connector and the MCP Standard Tools SuiteApp are available for your account.
2. In OpenSuiteMCP → **NetSuite**, add your account ID (e.g. `1234567` or `1234567-sb1`).
3. Follow the in-app Integration instructions (admin once per account), then **Connect**.
4. Confirm the header status chip shows connected before running SuiteQL / record tools.

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
| `MAX_MESSAGES_PER_DAY_GUEST` | `20` | Guest messages / 24h |
| `CHAT_BURST_LIMIT_PER_MINUTE` | unset / `0` (off) | Redis burst cap; fail-open if Redis is down |

## License & notices

**Free:** your organization may self-host for its own internal use. **Paid:** commercial delivery, paid implementation, or paid support of this product — only via [Unstacked Apps](https://www.unstackedapps.com/) (`support@unstackedapps.com`). Third parties may not charge to implement or commercially support this codebase.

After go-live, update via release tags — see [docs/upgrades](https://opensuitemcp.com/docs/upgrades) (also at `/docs/upgrades` when self-hosting).

- [LICENSE](LICENSE) — Sustainable Use License
- [NOTICE.md](NOTICE.md) — Usage notice
- [ATTRIBUTION.md](ATTRIBUTION.md) — Third-party credits
- [CHANGELOG.md](CHANGELOG.md) — Release history

Hosted product (separate from this repo): [opensuitemcp.com](https://opensuitemcp.com)
