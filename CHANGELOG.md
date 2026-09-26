# Changelog

All notable changes to OpenSuiteMCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.5.0] - 2026-09-26

### ✨ Added

- **An agent signs in instead of being handed a key.** Every install is now its own OAuth 2.1 authorization server, at its own address — self-hosted, sandbox and cloud alike, with nothing to register anywhere and no dependency on any of the others. A person pastes one URL into Claude, Claude Code, Cursor, VS Code, Gemini CLI or ChatGPT, and the client finds the rest: the `401` names the resource metadata, the metadata names the authorization server, and the person approves the agent on a consent screen here. The discovery half of this shipped already and had nothing behind it; `authorization_servers` was the missing field, and without it every client fell back to asking its user to go and find a token
- **One way to create an agent, and one field for how it connects.** **New agent** asks for a name, a persona, an optional NetSuite account to pin it to, and whether it connects by **agent key** or by **sign-in**. Choosing sign-in leaves it marked *Awaiting connection* until a client completes the flow. There is no second way in: an agent that signed in and an agent that was handed a key are the same row, made by the same dialog, listed together and revoked the same way
- **The consent screen is a yes-or-no question.** It asks nothing, because everything it used to ask was already settled when the agent was created. It shows which agent is about to be connected, the persona it acts as, and the host the browser will be sent back to, and offers Approve or Cancel — a picker appears only when more than one agent is waiting, and that is a choice between existing agents, not a way to make another. Approving binds a waiting agent to the client; it never creates one. If nothing is waiting, the screen says so and links to the portal rather than growing a form. Access itself stays all-or-nothing: what an agent reaches is the app's tool policy, re-read on every call, and a second gate that could disagree with it would be worse than none. One scope, `mcp`, meaning "act as me over MCP". The screen still warns when an agent is identified only by a port on your own machine
- **Agent access tells you how to connect, per client.** They all speak the same protocol and every one of them asks for it differently: a URL in a dialog, a CLI flag, `mcpServers`, `servers`, `url`, `httpUrl`. The differences are not interesting but they are load-bearing — a server pasted under Gemini CLI's `url` means SSE and simply never connects — so **Agent access → How to connect** hands over the exact thing to paste. It also says, before anyone spends twenty minutes on it, whether sign-in can work on this install at all: it needs `AUTH_URL` set and HTTPS, and an agent key needs neither
- **Three ways for a client to identify itself, because clients are mid-migration.** Client ID Metadata Documents, which revision `2026-07-28` prefers and Claude Code uses; dynamic registration, which that revision deprecates and several shipping clients still do; and a client created by hand under **Agent access → OAuth clients**, for a connector that asks for an ID and secret up front. PKCE with `S256` throughout. A loopback redirect matches without its port, which RFC 8252 requires and a native client cannot work without
- **Tokens that revoking actually stops.** Access tokens are opaque and hashed rather than signed, so revoking an agent takes effect on its next call rather than whenever a JWT would have expired — the property a key already had. Refresh tokens rotate on every use, and presenting one twice revokes every live token on that authorization rather than serving a replay; the authorization survives, so the client simply signs in again

### 🐛 Fixed

- **The protected resource metadata stopped advertising scopes it does not enforce.** It offered `read` and `write`, which have not existed since per-key scopes were dropped, and the documentation still told people a missing NetSuite tool might mean their key was read-only. Both said something that could not be acted on. `scopes_supported` is now the one scope this server issues, and the troubleshooting table says what is actually true: a tool is missing because an administrator disabled it for that account

---

## [5.4.2] - 2026-09-25

### ✨ Added

- **A long result or script opens beside the conversation instead of inside it.** A NetSuite result renders into a code block, inside a collapsed tool card, inside a chat bubble; a script the model writes lands in a fence in the same column. Either way there is about forty characters of width in which to read a vendor ledger or a fifty-line UserEventScript. Results and fences past a dozen lines now offer a canvas: the conversation keeps its place on the left and stays usable, and the content takes a resizable pane on the right with copy and download of its own. A split rather than a dialog — a dialog over the conversation would trade one unreadable thing for another. Desktop only: a split pane needs a second column to split into, and a phone has one

### 🐛 Fixed

- **An unreachable Oracle no longer stops the app starting.** The container entrypoint syncs the Oracle skill packs before the server starts, under `set -e`, and the sync exited non-zero when the fetch failed — so a third-party outage, or a firewall rule on the way out, became an app that never came up at all, repeating its boot and re-running migrations every few seconds. Reported now instead, which is the answer the Community sync beside it already gave. Skills stay at the last pack that synced
- **The main column no longer pushes past the room the sidebar leaves it.** It is a flex item with no minimum width, so `min-width: auto` applied and content wider than the space available pushed the column past it. Nothing showed while every child was centred and clipped; anything sitting flush against the right edge left the viewport by the width of the collapsed sidebar rail
- **A code block given a pane of its own scrolls rather than wraps.** Wrapping is right for a block sharing a chat bubble and wrong for one with room: a script arrived broken mid-token with its indentation lost, less legible than the fence it came from. Wrapping remains the default everywhere else

---

## [5.4.1] - 2026-09-25

### 🐛 Fixed

- **An agent's thread no longer ends in an error it never wrote.** A thread written over Agent access never opens a stream — `osmcp_append_chat` records messages directly — so one left on a user message, which the tool invites because a record that stops mid-task is still a record, asked the reader's page to resume a stream that was never going to exist. The reader was shown "Something went wrong" under an otherwise healthy transcript. Nothing to resume is not a failure, and the route already said so when there is no stream context at all
- **A tool call is held to the schema its tool publishes.** Every tool declares `additionalProperties: false` and none of it was enforced, so an agent recording its own transcript — sending `parts` beside `text` — got a message id back and had the part dropped on the floor. It went on believing the step was recorded, and the person reading the thread never learned one was lost. Only what a schema states is checked, so a NetSuite schema forwarded verbatim is held to its own terms and no stricter
- **An appended message keeps its place in the order.** Message order is read from `createdAt`, a millisecond stamp, and an agent logging steps as it works puts two appends inside the same millisecond. The tie had no defined order, so a transcript could be read back out of sequence, differently on each load. The chat row is now locked for the insert and the stamp forced past the last one

### ✨ Added

- **An agent can record a turn as it happened rather than prose about it.** A turn in this app is reasoning, then tool calls with their arguments and results, then an answer, and the transcript reads well because each of those is stored as itself. An agent working in another system has the same material and had one field to put it in. `osmcp_append_chat` now takes `parts` beside `text` — entries of kind `text`, `reasoning`, or `tool` with the tool's `name`, `input` and `output` — and a recorded call is shown the way this app shows its own, with its arguments and result. Recorded calls are stored as `dynamic-tool`, which keeps a tool run elsewhere from rendering as one this install made: a recorded `ns_` call is a report about NetSuite, not a call to it

---

## [5.4.0] - 2026-09-24

### ✨ Added

- **An agent can write personas and choose which one it is.** A key is assigned a persona the way it is already pinned to a NetSuite account: `osmcp_whoami` reports it, so a fresh connection learns which specialist it is meant to be without being told. `osmcp_create_persona` writes one — with `adopt` to become it in the same call — alongside `osmcp_update_persona`, `osmcp_delete_persona`, and `osmcp_set_agent_persona`, which sheds the current persona and returns the agent to Ava. Every key acts as some persona; Ava ships with the install and cannot be deleted, so no key is ever left holding a role that does not exist
- **A person assigns the persona when they create the agent.** Agent access now opens a dialog, and each agent can be renamed or moved to a different specialist afterwards without touching its key
- **NetSuite's prompt library is brokered to an agent.** `osmcp_list_prompts` and `osmcp_get_prompt` read the Companion SuiteApp's prompts live from the account, filterable by search, category, role and industry. Prompts carry their blanks as bracketed tokens and NetSuite publishes no schema for them, so they are detected rather than declared: `get` returns the filled text, the untouched template, and the blanks still open, and never refuses
- **`osmcp_search_netsuite_docs`** — the Oracle NetSuite Help Center, through this install's own search and result cache, so an agent answers from documentation rather than memory
- **`osmcp_create_chat` and `osmcp_append_chat`** — an agent's work appears as a thread in its owner's sidebar, stamped with the persona it acts as
- **`toolsDigest`** on `tools/list` and `osmcp_whoami` — a fingerprint of the tool surface a key can reach. This server is stateless and cannot push `notifications/tools/list_changed`, so a watching agent compares one string instead of every entry
- **An agent's key can be replaced without replacing the agent**, and copied again whenever its owner needs it — stored encrypted as well as hashed, returned only to that owner, and never rendered on screen
- **Agents are archived rather than silently retired.** Revoking asks first, the agent keeps its name because the threads it opened still refer to it, and the archive is hidden behind a toggle

### 🐛 Fixed

- **`initialize` answers the revision the client asked for.** A conformant client states its revision in the request body; the `MCP-Protocol-Version` header is only defined for the calls that follow. Answering from the header pinned every such client to the oldest accepted revision
- **A settings save no longer erases who wrote a persona.** The Personas panel sends the whole list back on every save and the settings schema did not name `authoredBy`, so adding one persona in the app unstamped every persona an agent had written — and the guardrail then read them as person-written, leaving an agent unable to revise its own work
- **`osmcp_list_personas` honours organization persona policy.** An agent acting for a member of an organization that narrows the builtin personas could see all of them
- **Saving a persona in Settings keeps its primary role**, a field the editor does not expose and was rebuilding away

### ♻️ Changed

- Personas carry an `authoredBy` stamp and the picker says which an agent wrote. An agent may revise or delete what agents wrote, never a persona a person wrote and never one its owner has made their default
- The persona playbook structure has one definition, rendered into both the persona-builder interview and the MCP tool schema, so a persona written by an agent reads like one written by a person
- The prompt browser and the MCP tools read one parser. NetSuite's payload opens by telling its reader to ignore the response — it is addressed to the app, not to a model — and only the prompt records leave that parser

---

## [5.3.1] - 2026-09-23

### 🐛 Fixed

- **Agent access was unreachable for users carrying an organization id on an install that is not in org mode** — anyone who signed up before the mode was settled, or while it was. The policy branched on the user's org rather than the install's, and such an install has no admin area, so nothing could create the policy row their org then required. They were told to ask an administrator who did not exist. Org-ness now comes from the install; an org install with no org on the user fails closed rather than open
- **Connected skill counts survive the files going missing** — the stored count is what the last sync wrote, and the packs live outside the database. Both the skills modal and the org admin view now report what a source can actually serve, and the modal no longer falls back to the stored number in the one case that matters
- **The thinking indicator stays up until an answer starts** — reasoning and tool calls retired it early, leaving a motionless screen mid-turn, and a second indicator could appear beside the first once a tool call made the message visible
- **New Chat starts one without a page reload** — the chat page rewrites the URL with `history.replaceState`, which the router never sees, so a link to `/` navigated nowhere and left the open conversation in place

### ♻️ Changed

- **Solo onboarding asks for two things**, NetSuite and an LLM provider, matching the hosted flow. The eight optional steps moved to the finish slide, which names them with the completion state the steps reported
- A user's skills are assembled in one place rather than separately by the settings route and the MCP surface

---

## [5.3.0] - 2026-09-23

### ✨ Added

- **Agent access** — OpenSuiteMCP can now act as an MCP server so an external AI agent works inside a user's NetSuite workspace as that user. Nothing to switch on: the endpoint refuses every request until someone mints a key, and org installs gate it behind an admin. See [docs/mcp-server.md](docs/mcp-server.md)
- **Per-user agent keys** — App Portal → **Agent access** mints keys, shown once and stored only as a SHA-256 digest. Keys can be pinned to one NetSuite account. Access follows the tool policy already configured in the app, so a key grants no more and no less than its owner has enabled
- **NetSuite tool passthrough** — every allowed NetSuite MCP Standard Tool is re-exposed with its JSON Schema forwarded verbatim, plus ten `osmcp_*` workspace tools: identity, connection health, accounts, chats, and the skills and personas an agent can now read in full and act on
- **Organization Agent access policy** — **Admin → Agent access** turns the feature on for an organization, caps keys per member, and can narrow it to named members; every change is audited

### Changed

- Server URL derives from the install's public origin, so self-hosted, sandbox, and hosted installs each advertise their own address with no extra configuration
- `middleware.ts` exempts `/api/mcp` and `/.well-known/oauth-protected-resource` from the cookie gate so bearer-authenticated clients reach their route handlers

### 📦 Database

- Migration `0025_mcp_server` — `McpApiKey` and `OrgMcpServerPolicy` tables (`pnpm db:migrate`)
- Migration `0026_drop_mcp_key_scopes` — removes key scopes and the org write-scope flag; access follows the app's own tool policy instead
- Migration `0027_agent_access_member_policy` — `UserAgentAccess` table and a `memberAccess` mode, so an org can open Agent access to everyone or to named members

### 🧰 Technical

- Streamable HTTP revision `2026-07-28` (stateless: no sessions, no GET stream, no `initialize`), with `2025-11-25` / `2025-06-18` / `2025-03-26` still accepted for clients that predate it
- Transport implemented in-repo rather than via an adapter; every protocol detail lives in `lib/mcp/server/protocol.ts` with the revision pinned as a constant
- Optional per-key rate limit via `MCP_CALL_LIMIT_PER_MINUTE` (fails open without Redis, matching the existing chat burst limiter)
- A method-not-found reply names the methods this server answers, and says so plainly when the name it was given is a tool rather than a method

---

## [5.2.0] - 2026-09-10

### ✨ Added

- **Skill invocation modes** — Auto, Slash command, or Off per skill across Oracle, Community, Connected, and Custom (defaults: Oracle/Community Off, Connected Slash, Custom Auto). Composer `/` lists Auto and Slash skills.
- **Thinking chips** — model reasoning shown as chips on the turn
- **Turn usage** — context / token usage for the current turn
- **Pretty MCP tool output** — formatted tool results, including SuiteQL

### Changed

- Skills panel uses a mode select instead of a boolean toggle
- Chat message layout: grouped parts, sidebar history, and stick-to-bottom behavior

### 📦 Database

- Migration `0024_skill_modes` — `UserSettings.skillModes` jsonb (`pnpm db:migrate`)

### 🧰 Technical

- `gpt-tokenizer` for context breakdown; `package.json` version aligned to `5.2.0`

---

## [5.0.1] - 2026-08-27

### 🐛 Fixed

- **`publicAppUrl` TypeScript build** — narrow `isSafeAppPath` to `` `/${string}` `` so `next build` typechecking passes (wip CI caught this; public lint-only workflow did not)

---

## [5.0.0] - 2026-08-27

### ✨ Added

- **Organization admin** — `OSMCP_INSTALL_MODE=org|solo`, `/setup` org bootstrap, Admin area for owners/admins (users, LLM providers, NetSuite MCP/OIDC, skills, search, personas)
- **Post-install onboarding** — Solo and org setup wizards with required MCP + LLM steps and optional OIDC, search, and custom skills
- **NetSuite OIDC app login** — Separate OAuth integration and callback from MCP; multi-account OIDC picker, per-account **Test connection**, and redirect URI copy fields
- **Per-account MCP connect** — DCR probe, integration setup card, and OAuth connect per NetSuite connection in settings, onboarding, and admin
- **Node bootstrap orchestrator** — `pnpm bootstrap:local` and `pnpm reset:backend` via `docker/scripts/local-orchestrator.ts` for cross-platform dev setup
- **Org policy overlays** — Central org defaults for LLM, MCP accounts, skills, and search with per-user overrides where allowed
- **User tags** — Org admin can tag users for filtering and assignment
- **Docs** — [NetSuite OIDC login](docs/netsuite-oidc-login.md) and [org admin upgrade](docs/org-admin-upgrade.md) for existing installs

### Changed

- **Setup backend TUI** — Organization vs solo prompt; NetSuite OIDC client ID masked as password input
- **Login and setup branding** — Larger OpenSuiteMCP logo on auth pages
- **LLM provider settings** — Stop auto-listing unconfigured provider seed rows in settings
- **Onboarding step nav** — Display-only progress rail; optional steps use **Skip for now**

### 🐛 Fixed

- **OAuth returnTo** — Block protocol-relative open redirects (`//evil.com`)
- **Org skills and search** — Respect org-disabled resources; sync org policies when a user has no saved settings yet
- **NetSuite callbacks** — JWT org lookup, skills scope, and callback URL handling for org installs
- **Skills sync and solo auth** — Harden community/oracle sync and local bootstrap reliability
- **SearXNG** — Disable wikidata engine that caused search failures in local Docker

### 💥 Breaking

- **Database** — run `pnpm db:migrate` (`0014`–`0023`: org admin tables, onboarding state, user OIDC links, org OIDC verification, user tags, connected-skill prefs)
- **Fresh installs** — `pnpm setup:backend` requires choosing **organization** or **solo** install mode (`OSMCP_INSTALL_MODE`, `OSMCP_ROOT_EMAIL` for org)
- **Existing installs** — designate an org owner after migrate; see [docs/org-admin-upgrade.md](docs/org-admin-upgrade.md)

### 🧰 Technical

- **`package.json` version** aligned to `5.0.0` (tags remain source of truth for releases)

---

## [4.1.0] - 2026-08-19

### ✨ Added

- **Personas** — Six built-in NetSuite specialists (`.personas/`), persona picker, header badge, Personas panel, and interview builder for custom personas
- **Community skills** — Shared pack from [opensuitemcp-community-skills](https://github.com/unstackedapps/opensuitemcp-community-skills); synced via `pnpm skills:sync` into `COMMUNITY_SKILLS_DIR`
- **Connected skills** — Paste a public GitHub repo/folder URL; invoke with `/skill-name` in the composer; per-user cache under `.data/connected-skills/<userId>/…`
- **Slash skill badges** — `/skill` tokens stay visible in the user bubble; stripped only when sending to the model
- **MCP tools cache** — Durable per-account tool catalog on disk with background refresh

### 🐛 Fixed

- **Persona draft types** — production TypeScript build for persona interview save flow
- **Skills pack sync gate** — `DISABLE_SKILLS_PACK_SYNC` and `lib/product-features.ts` hide Oracle/Community Refresh when pack sync is operator-managed (hosted overlay sets this off)

### 📦 Database

- Migrations `0011_personas`, `0012_persona_interview`, `0013_connected_skill_sources`

---

## [4.0.2] - 2026-08-15

### 🐛 Fixed

- **Composer provider + mode** — switching Speed/Reasoning no longer refreshes the page and snaps back to the previous AI provider; the Settings default radio applies to new/empty chats

---

## [4.0.1] - 2026-08-15

### Changed

- **Product docs** — guides live only at [opensuitemcp.com/docs](https://opensuitemcp.com/docs). Self-hosted `/docs` redirects there (308). App Portal setup links open the public site.
- NOTICE: hosted evaluation is live at opensuitemcp.com
- README: skills apply to new messages (not per-thread); custom endpoint wording

---

## [4.0.0] - 2026-08-14

### ✨ Added

- **Multiple named AI providers** — save up to 10 (Google, Anthropic, OpenAI, or custom OpenAI-compatible HTTPS); pick a provider per chat; list Speed / Reasoning models from the live API
- **Canonical provider list** — Google, Anthropic, and OpenAI are always seeded in settings (add extra named copies as needed)
- **Per-account NetSuite MCP tools** — enable or disable individual tools per connected account (opt-out denylist)

### Changed

- **NetSuite OAuth tokens** — access and refresh tokens encrypted at rest with AES-256-GCM (`ENCRYPTION_KEY`); plaintext rows are re-encrypted on next use
- **Multiple NetSuite connections** — keep OAuth tokens per account; radio (and composer) set the active one; prompts, skills, and MCP use that account only; composer lists connected accounts only
- **Composer model menu** — provider and Speed/Reasoning share one nested control; NetSuite stays its own dropdown
- **NetSuite accounts** — drop the global 1–2–3 chips; Integration setup is a yellow card for the selected account, only when the Integration record is missing
- **Wider chat column** — composer, messages, and empty-state greeting use `max-w-3xl`

### 💥 Breaking

- **Database** — run `pnpm db:migrate` (`0009` `aiProviders` / `Chat.aiProviderId`, `0010` `netsuiteMcpTools`)
- **Token encryption** — NetSuite access and refresh tokens encrypt at rest on next use; `ENCRYPTION_KEY` is required

### 🧰 Technical

- **Node.js 22 + Ultracite 7** — CI and lint use Node 22; Ultracite 7.10.3 (Biome 2.5.6), pinned in-repo
- **Tailwind class lint** — `pnpm lint` now runs the official Tailwind language-server checks (`suggestCanonicalClasses` and class conflicts) so IDE-only class rewrites fail in CI
- **Self-hosted fonts** — Geist from the local package and vendored Raleway woff2 so `next build` does not fetch Google Fonts
- **Custom provider URLs** — stricter HTTPS/SSRF checks and clearer validation messages
- **ENCRYPTION_KEY** — accept base64, raw 32-byte UTF-8, or hash longer strings to a 32-byte AES key
- **`package.json` version** aligned to `4.0.0` (tags remain source of truth for releases)

---

## [3.1.1] - 2026-08-07

### ✨ Added

- **Upgrades doc** — `/docs/upgrades` runbook for tag-based self-host updates (`skills:sync`, migrate, rebuild)
- **Licensing clarity** — self-host “Who may run this” plus README/NOTICE: free for your org’s internal use; paid delivery/support only via Unstacked Apps

### 🐛 Fixed

- **`pnpm dev` Turbopack failure** — default to webpack (`next dev`); optional `pnpm dev:turbo` (AI SDK `provider-utils` dynamic import under Turbopack)

### 🧰 Technical

- Docs index links Upgrades; self-host cross-links to the upgrades runbook

---

## [3.1.0] - 2026-08-07

### ✨ Added

- **NetSuite connect wizard**
  - Guided App Portal flow with shared Integration checklist
  - Manage accounts (active radio, rename, compact controls)
  - Public `/docs` + `/docs/netsuite-integration` setup guide

- **Org-hosted architecture doc**
  - `/docs/self-host` trust-boundary overview for security / architects

- **Oracle skills sync**
  - Skills pack no longer vendored in git; `pnpm skills:sync` pulls from Oracle’s agent-skills repo into `.data/oracle-skills`
  - Catalog reads the on-disk pack; new upstream skills appear as toggles (off by default)

- **Shared model registry**
  - Canonical Speed / Reasoning model IDs for Google, Anthropic, and OpenAI

### 🐛 Fixed

- **Anthropic Sonnet thinking** — use adaptive thinking + effort (Sonnet 5+ rejects `thinking.type.enabled`)
- **Dialog / sheet / tooltip polish** — mobile footer gaps, dialog width, tooltip collisions for chat history

### 🧰 Technical

- Bump `@ai-sdk/anthropic` for adaptive thinking support
- `.data/` gitignored for synced Oracle skills cache
- Docs routes are public (no guest session required)

---

## [3.0.0] - 2026-08-06

### ✨ Added

- **Unified App Portal**
  - Single Claude-style modal for Chats, Skills, Prompts, AI Provider, NetSuite, Web Search, Timezone, and Account
  - Consistent panel chrome (compact header, muted subtitle, optional docs links, flat body rows)

- **SuiteCloud Agent Skills**
  - Oracle skill pack + custom SKILL.md support with per-session enable/disable
  - Enabled skills injected into the system prompt for new messages
  - Skills API routes and user skill settings persistence

- **Native Companion Prompt Library**
  - Browse Companion SuiteApp templates with category / industry / role filters
  - Placeholder fill-in flow, then send into chat

- **NetSuite MCP connection hardening**
  - Multi-account management, DCR probe, connect/disconnect, MCP call/resource helpers
  - Connection status chip and clearer admin Integration instructions

- **Usage protection**
  - Daily message entitlements configurable via `MAX_MESSAGES_PER_DAY_REGULAR` / `MAX_MESSAGES_PER_DAY_GUEST`
  - Optional Redis burst limit via `CHAT_BURST_LIMIT_PER_MINUTE` (fail-open when Redis unset)

### 💥 Breaking

- **Inception Labs provider removed** — supported providers are Google (Gemini), Anthropic (Claude), and OpenAI (GPT) with BYOLLM keys
- **Guest chat on hosted** — commercial overlay requires sign-in (OSS self-host guest path unchanged)
- **Web search surface narrowed** — Folio3 / Tim Dietrich domain tools removed; NetSuite Help Center search remains

### 🧰 Technical

- Migrations `0007_netsuite_accounts_dcr` and `0008_user_skill_settings`
- `package.json` version aligned to `3.0.0` (tags remain source of truth for releases)

---

## [2.6.0] - 2026-03-04

### ✨ Added

- **Custom Instructions (instructions.md)**
  - Settings → Custom Instructions: import an `instructions.md` file or paste content to add user-specific directives
  - Custom instructions are appended to the system prompt as "Additional User Instructions"
  - Protected core directives (tool completion, no fabrication, orchestration rules, Ava identity) cannot be overridden by user instructions

- **System prompt enhancements**
  - Refactored prompts for clearer identity, response rules, search triage, and tool orchestration
  - Intent-based search triage (by user need) instead of fixed priority
  - Step budget clarified: "Do not stop early unless the objective is satisfied" to reduce artificial tool usage
  - Search scaling: prefer 1–2 targeted searches; additional searches only when they address clearly distinct sub-topics and stay within the step budget
  - Fiscal/quarter-based queries: explicit guidance to derive period from provided date/time

- **Robust tool orchestration**
  - Resolution model (Fully Resolved, Partially Resolved, Blocked) with clearer decision sequencing
  - MCP rules: max 3 consecutive calls before alternating with search; alternating resets the count
  - Completion condition: stop only when objective satisfied, NetSuite operation completes, or system ends turn
  - Protected directives block user instructions from overriding safety and orchestration rules

### 🐛 Fixed

- **Migrations (inceptionApiKey)**
  - 2.4.0 added `inceptionApiKey` to the schema and journal but the migration file was never committed
  - 2.5.0 did not address this; users on 2.4.0/2.5.0 could encounter "column already exists" or missing-column errors
  - Migration `0006_illegal_sunfire` adds `inceptionApiKey` and `customInstructions` with `IF NOT EXISTS` for reliable fresh installs and upgrades

### 🧰 Technical

- New `customInstructions` column in UserSettings for user-provided prompt additions
- `PROTECTED_DIRECTIVES` in prompts.ts enforces non-overridable core rules when custom instructions are present

---

## [2.5.0] - 2026-03-03

### ✨ Added

- **Inception Labs provider enhancements**
  - Custom Inception provider (`lib/ai/custom-providers/inception.ts`) with reasoning summary extraction for Mercury 2
  - Diffusion streaming for reasoning mode (live refinement display)
  - Reasoning effort, summary, and diffusing options forwarded for Mercury 2 model

### 🧰 Technical

- Added `@ai-sdk/openai-compatible` as explicit dependency for Inception Labs (Mercury 2) integration

---

## [2.4.0] - 2026-02-28

### ✨ Added

- **Inception Labs provider**
  - Added Mercury 2 as a selectable provider for speed and enhanced reasoning
  - New Inception API key support in Settings and user configuration
  - OpenAI-compatible chat completions integration with Mercury 2
  - Reasoning effort parameters forwarded for Mercury 2 reasoning mode

### 🧰 Technical

- Added `@ai-sdk/openai-compatible` for Inception Labs integration

---

## [2.3.0] - 2026-01-30

### ✨ Added

- **Custom Web Search Tools**
  - Three domain-specific search tools (NetSuite docs, Tim Dietrich blog, Folio3 Knowledge Base) replace the single web search + list-search-domains flow
  - Settings → "Custom Web Search Tools": per-domain toggles control which search tools Ava can use in chat
  - System prompt triage table guides model on when to use each search tool
  - Optional Redis-backed search cache (7-day TTL) for repeated queries per domain

### 🐛 Fixed

- **Migrations**
  - Migration `0005_dark_the_order` uses `IF NOT EXISTS` for `maxIterationsReached` and `maxIterations` columns for safe re-runs

### 🎨 Changed

- **Settings**
  - "Web Resources" renamed to "Custom Web Search Tools" with clearer description (NetSuite docs, Tim Dietrich, Folio3; only enabled tools available in chat)
- **Tool UI**
  - Tool status badges support new states: "Approval requested", "Approval responded", "Denied"
  - Get current config tool output shows OpenAI provider with emerald styling
- **Types & API**
  - Shared web search types and helpers moved to `lib/ai/web-search.ts`; domain catalog simplified in `lib/ai/search-domains.ts`
  - Chat tools type: `searchNetsuiteDocs`, `searchTimDietrich`, `searchFolio3` replace `webSearch` and `listSearchDomains`

### 🔧 Technical

- Upgraded `@ai-sdk/react` from 2.0.26 to ^3.0.26 (ai@6.0.50 via pnpm overrides)
- Removed `list-search-domains` tool and ListSearchDomainsToolOutput component
- Simplified `getTrailingMessageId` and message types (no CoreAssistantMessage/CoreToolMessage)
- OpenAI added to GetCurrentConfigToolOutput provider labels

---

## [2.2.0] - 2026-01-28

### ✨ Added

- **Iteration Management System and Workflow**
  - Flag-based max reasoning steps handling (no in-thread message injection)
  - Database flag `maxIterationsReached` on Chat to lock thread until user chooses an option
  - User-configurable max reasoning steps (1–20) in Settings → AI Provider, default 10
  - Info card above input when max steps reached, with three actions:
    - "Check NetSuite KB and continue" — clears flag and sends auto message to search NetSuite web resources
    - "No, I'm fine" — clears flag and unlocks thread
    - "Brute force it" — clears flag and sends auto message to continue
  - Thread stays locked (input disabled) until an option is chosen; card persists on reload
  - API: `GET /api/chat/[id]` returns `maxIterationsReached`; `POST /api/chat/[id]/max-iterations` clears the flag
  - Single combined migration for `UserSettings.maxIterations` (default `'10'`) and `Chat.maxIterationsReached` (default `false`)

---

## [2.1.0] - 2026-01-27

### ✨ Added

- **OpenAI Provider Support**
  - Added OpenAI as a third AI provider option
  - GPT-5 Mini for speed mode (fast responses and tool calls)
  - O4 Mini for enhanced reasoning mode (complex agent tasks and structured data analysis)
  - OpenAI API key storage and encryption in user settings
  - Organization verification notice for reasoning features

- **Error Handling**
  - Custom streaming error handling with persistent error messages in chat UI
  - Error cards with improved dark mode styling and text wrapping
  - Error message persistence across page reloads
  - Chat-related error filtering to prevent general system errors from appearing in chat

### 🐛 Fixed

- **Settings Modal**
  - Fixed intermittent form clearing issues (empty fields after save/reopen)
  - Fixed provider dropdown display when switching providers
  - Fixed skeleton loading states to match input field dimensions
  - Fixed spacing and layout (removed double scrollbar)

- **Error Recovery**
  - Fixed status reset after errors to allow follow-up messages
  - Fixed empty message prevention after errors
  - Fixed stream interference when sending messages after errors

### 🎨 Changed

- **UI/UX Improvements**
  - Simplified settings save mechanism (removed 'Save and Edit' dropdown)
  - Updated model descriptions to match actual models used
  - Improved error card legibility in dark mode
  - Better spacing between header, form content, and action buttons in settings modal

- **Documentation**
  - Simplified README to focus on purpose and quick start
  - Added documentation table of contents linking to LICENSE, NOTICE, ATTRIBUTION, CHANGELOG
  - Added app screenshot and icon to README
  - Removed redundant license/attribution content from README

### 🔧 Technical

- Upgraded `@ai-sdk/anthropic` from ^2.0.57 to ^3.0.23
- Upgraded `@ai-sdk/google` from ^2.0.26 to ^3.0.13
- Resolved compatibility warnings for reasoning features
- Added comprehensive error handling with chat-related error filtering
- Implemented error flag management to prevent stream interference
- Added proper status management for error recovery
- Improved type safety in provider configuration
- Added database migration for OpenAI API key storage

---

## [2.0.0] - 2026-01-26

### 🎉 Complete Rewrite

Complete architectural overhaul from LangChain/Express to Next.js with Vercel AI SDK.

### Breaking Changes

⚠️ **This is NOT backward compatible with v1.x**

- Complete rewrite - new codebase
- New database schema required (PostgreSQL with Drizzle ORM)
- New authentication flow (NextAuth)
- New API structure (Next.js App Router)

### Major Changes

#### Architecture

- **Migrated from LangChain/Express to Next.js App Router**
  - Full-stack Next.js application
  - Server components and server actions
  - API routes with streaming support

- **Replaced LangChain with Vercel AI SDK**
  - Native streaming support
  - Better tool integration
  - Provider abstraction

- **Database Migration**
  - From file-based sessions to PostgreSQL
  - Drizzle ORM for type-safe queries
  - User management and chat persistence

#### Authentication

- **NextAuth Integration**
  - Guest user support
  - Credentials-based authentication
  - Session management with JWT

#### AI Providers

- **Multi-Provider Support**
  - Google Gemini (2.5 Flash, 2.5 Pro)
  - Anthropic Claude (4.5 Haiku, Sonnet 4)
  - Reasoning/thinking modes for both providers

- **Model Selection**
  - Speed mode (fast responses)
  - Enhanced reasoning mode (deep thinking)

#### Features

- **Chat Management**
  - Chat history with pagination
  - Title and summary generation
  - Public/private visibility
  - Message voting

- **User Management**
  - User registration and login
  - Guest user support
  - User settings with encrypted API keys
  - Last login tracking

- **UI/UX**
  - Complete redesign with shadcn/ui
  - Modern sidebar navigation
  - Responsive design
  - Dark/light theme support

#### License

- **New Sustainable Use License**
  - Allows internal use and self-hosting
  - Prohibits commercial redistribution
  - All commercial rights reserved by Unstacked Apps, LLC

### Technical Stack

**Frontend & Backend:**

- Next.js 15 (App Router)
- React 19
- TypeScript
- Tailwind CSS
- shadcn/ui components

**AI & Database:**

- Vercel AI SDK
- Drizzle ORM
- PostgreSQL
- NextAuth.js

**Tools:**

- Web search
- Webpage reading
- Search domain configuration
- Current config reporting

### Migration Notes

Users upgrading from v1.x will need to:

1. Set up new database (PostgreSQL)
2. Run migrations (`pnpm db:migrate`)
3. Re-authenticate with NetSuite
4. Re-configure AI provider settings

---

## [1.1.0] - 2025-10-13

### 🚀 Enhanced User Experience

#### Authentication Improvements

- **Automatic Token Refresh**: Sessions now stay alive indefinitely with automatic token refresh every 60 seconds
- **Smart Expiration Handling**: Tokens refresh automatically when expired or expiring within 5 minutes
- **Graceful Error Handling**: Clear error messages if token refresh fails

#### UI/UX Enhancements

- **Modern Input Design**: Pill-shaped input with integrated send button (similar to Gemini)
- **Bot Icon**: Replaced LockOpen icon with Bot icon for assistant messages
- **Spinning Ring Animation**: Visual feedback during AI processing with animated ring around avatar
- **Improved Markdown Rendering**: Better styling for lists, code blocks, headers, and links
- **Hidden Scrollbar**: Cleaner appearance with hidden scrollbar (still scrollable)
- **Auto-Focus**: Cursor automatically returns to input after submitting a message
- **Continuous Input**: Input stays enabled during loading, allowing users to queue next question

#### Visual Improvements

- **Consistent Typography**: Unified font sizes across user and assistant messages
- **Better Spacing**: Improved padding and margins throughout the interface
- **Auto-Scroll**: Messages automatically scroll to bottom on load and new messages
- **Loading State**: Clear "Processing with MCP tools..." indicator with spinning animation

### Technical Improvements

- **Focus Management**: Added inputRef for better cursor management
- **Scrollbar CSS**: Custom CSS utilities for hiding scrollbars across browsers
- **Status Check Logic**: Enhanced auth status endpoint with token refresh logic

---

## [1.0.0] - 2025-10-11

### 🎉 Initial Release

First stable release of OpenSuiteMCP - an open source, production-ready NetSuite MCP client with AI-powered natural language queries.

### Features

#### Authentication & Security

- OAuth 2.0 with PKCE authentication flow
- Secure session management with file-based persistence
- Automatic token refresh
- No credentials stored client-side

#### AI Integration

- Multi-provider AI support (OpenAI, Anthropic Claude, Google Gemini)
- LangChain framework for AI orchestration
- Streaming responses with real-time tool execution visibility
- Automatic conversation memory across sessions
- Type-safe tool definitions with Zod validation

#### NetSuite Integration

- Native MCP REST API integration (no local server needed)
- 5 built-in MCP tools:
  - `ns_runReport` - Run NetSuite reports
  - `ns_listAllReports` - List all available reports
  - `ns_listSavedSearches` - List saved searches
  - `ns_runSavedSearch` - Execute saved searches
  - `ns_runCustomSuiteQL` - Run custom SuiteQL queries
- Auto-discovery of MCP tools
- Real-time tool execution feedback

#### User Experience

- Natural language query interface
- Beautiful React UI with Tailwind CSS
- Dark mode support
- Configuration panel for easy setup
- Persistent session state (survives page reloads and server restarts)
- Sample queries to get started quickly
- Real-time streaming AI responses

#### Developer Experience

- Full TypeScript/JSDoc support
- Comprehensive documentation (README, ARCHITECTURE, INSTALLATION)
- Development mode with hot reload
- Clean, modular architecture
- Easy deployment to production

### Technical Stack

**Backend:**

- Express.js web server
- LangChain AI framework
- MCP SDK for NetSuite integration
- Session-file-store for persistence
- Zod for schema validation

**Frontend:**

- React 18 with Vite
- Tailwind CSS with dark mode
- Lucide React icons
- React Markdown with GFM support

### Documentation

- Complete installation guide
- Architecture documentation
- Troubleshooting section
- Production deployment guidelines
- API endpoint documentation

---

[5.2.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.2.0
[5.0.1]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.0.1
[5.0.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.0.0
[4.1.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v4.1.0
[3.0.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v3.0.0
[2.6.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v2.6.0
[2.5.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v2.5.0
[2.4.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v2.4.0
[2.3.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v2.3.0
[2.2.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v2.2.0
[2.1.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v2.1.0
[2.0.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v2.0.0
[1.1.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v1.1.0
[1.0.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v1.0.0
