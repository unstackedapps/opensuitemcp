# Changelog

All notable changes to OpenSuiteMCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.10.0] - 2026-10-09

### ✨ Added

- **Tool calls from agent apps are counted.** Each tool an agent app calls over MCP adds one to an hourly total, kept per user, agent app (API key or OAuth grant) and tool. A call also counts as failed when the tool returned an error, rejected its arguments, or threw. Calls to an unknown tool and calls refused by the rate limit are not counted. Counting never fails or slows a call
- **The instance report carries them.** `activity.agentToolCallsLast7Days` and `activity.agentToolErrorsLast7Days` give the last 7 days' totals. `reportVersion` stays `1`, because no field changed meaning

### 📦 Database

- Migration `0044_mcp_tool_calls` — `McpToolCallHourly`, one row per user, agent app and tool in each hour. Hourly totals rather than a row per call, so a busy agent adds rows by the hour. The rows go with their user

## [5.9.1] - 2026-10-09

### 🐛 Fixed

- **NetSuite docs search returns only Oracle NetSuite Help Center pages.** `osmcp_search_netsuite_docs` and the Help Center search in chat returned general web results labelled as Help Center results: a query about Ship Central SuiteApp access returned Medicare SHIP pages and the Wikipedia article "Ship". SearXNG sends `site:` with the query, and Bing, often the only engine that answers, ignores it. Every result outside a search resource's host and path is dropped now, on custom resources too. The Help Center query also names NetSuite and the Oracle Help Center, because Bing ranks on the leading words and the filter alone left most searches empty
- **A search that found nothing runs again the next time it is asked.** An empty result usually means the engines refused the request, and it was cached for 7 days like any other

## [5.9.0] - 2026-10-08

### ✨ Added

- **An instance reports its health to whoever operates it.** Set `OSMCP_INSTANCE_REPORT_TOKEN` to 32 characters or more, and `GET /api/instance/report` answers a request bearing that token with counts as JSON: version and install mode; users, new and signed in; messages, active users, runs, failed runs and tool errors over seven days; NetSuite accounts with no token, which need connecting again; agent apps; AI providers; and migrations applied. No message text, emails or names. While the token is unset the route answers `404`. Setup and every field are in [docs/instance-report.md](docs/instance-report.md)
- **The report lists recent server errors.** It keeps the 50 newest, from errors a request threw and from `console.error`, because most routes catch their own errors and only log them. A path drops its query string and a message stops at 300 characters, because either can carry the data that caused the error. The list lives in memory, and a restart empties it

## [5.8.2] - 2026-10-05

### 📝 Changed

- **The connect page says a file name once.** Four methods carried a heading reading "Add it to `~/.claude.json`" directly above a label reading `~/.claude.json`. One line names the file and the action now, on both Claude Code CLI methods and both Cursor methods

## [5.8.1] - 2026-10-05

### 📝 Changed

- **The connect page names the two Claude surfaces separately.** The tabs read Claude and Claude Code; they are **Claude Desktop** and **Claude Code CLI** now. "Claude" reads as the company rather than the app, and the two surfaces behave differently enough to be worth telling apart — the CLI renders all four briefings from `prompts/list`, and the desktop app renders none
- **Both Claude Code CLI routes show the file a person edits.** Each showed a `claude mcp add` command, so `~/.claude.json` never appeared on the page — and that file is where `"type": "http"` is required. Without it the CLI skips the server with no error, and only `/doctor` says why. Each route now shows the entry, the two differing only by the `Authorization` header

## [5.8.0] - 2026-10-04

### ✨ Added

- **Talk your prompts into the composer.** A microphone sits beside send. It uses the browser's own speech recognition, so it works whichever LLM provider you brought — on-device where the browser offers it, the cloud engine otherwise. Dictation settings carry a language picker covering 64 tags and a switch for spoken punctuation, which Chrome adds without being asked
- **Artifacts.** A long result or a script a session produced can be kept, and it lands in an **Artifacts** panel as tiles. Save sits in the block header in the chat as well as in the canvas, so keeping something costs one press. An agent writes one over MCP with `osmcp_write_artifact`
- **Memory.** Tell a chat to remember something and it is there at the start of the next one. Facts are written only when asked for — never inferred from a tool result or from what seemed useful. Each is kept against the NetSuite account that was connected, so a fact learned in sandbox is never read against production. The **Memory** panel lists them with search and an account filter, and carries edit, delete, **Forget all**, and a switch that stops memory being read or written without deleting anything. An agent reaches the same store with `osmcp_remember`, `osmcp_recall` and `osmcp_forget`
- **A turn says which memories it was given.** The usage line under an answer counts them beside the skills and tools, and names each one with the account it came from. A memory is injected before the model runs and leaves no trace in the answer, so this is the only place it is visible
- **Briefings reach any client.** The four instruction sets this server publishes — start a task, choose a persona, record the session, capture a skill — are reachable with `osmcp_run_briefing` as well as from a client's `/` menu. Whether that menu exists is decided per surface, not per vendor: on 2026-10-04 the same server showed all four in Cursor and the Claude Code CLI, and none in the Claude Code desktop app or Claude Desktop
- **The connect guide covers the Claude Code CLI.** A hand-written entry needs `"type": "http"`, and the CLI skips the server silently without it

### 📝 Changed

- **Every settings panel is built from the same four components.** Eleven panels had each assembled their own header, list, row and search field — cards here, line breaks there, a title with an icon on one and without on the next. One `PanelHeader`, `PanelBody`, `PanelList` and `SettingRow` now, with fewer rules and no boxes. Panel headers stay pinned while the content scrolls
- **The settings navigation regroups** into Workspace, Assistant, Connections and Preferences, each row carrying an icon. Timezone and dictation sit together under General
- **A search field is one component.** `Input` and `Select` now stand their responsive defaults aside when a caller sets that property, which is why a magnifier used to sit on top of its own placeholder above 768px and a dropdown stood 8px taller than the field beside it
- **The four built-in instruction sets are called briefings**, not prompts. A prompt in this product is text a person drops into a chat, which is what the NetSuite Companion library publishes
- **American spelling throughout** — recognize, behavior, color, labeled, center

### 🐛 Fixed

- **A turn no longer renders twice while it streams.** A turn's data parts arrive before its answer starts and can land in an assistant message of their own. That message has nothing to show, but it still drew a usage line and an action row, so every turn appeared twice with the blank copy on top until the page was reloaded. Present since 5.7.0, and visible only live — the stored chat was always correct
- **Four NetSuite tools stopped announcing that reading would change something.** `ns_runReport` and the three MCP App launchers carry no verb the classifier claims, so they fell through to its fail-closed default: every client drew a destructive warning on them, and a read-only key could not call them at all. A write verb still outranks the new hints, and an unrecognized name is still a write

### 🗄️ Database

- `0042_documents.sql` adds the `Document` table behind artifacts and memory, one row per path per user, scoped by NetSuite account
- `0043_memory_enabled.sql` adds `UserSettings.memoryEnabled`

## [5.7.1] - 2026-09-30

### 🐛 Fixed

- **A sidebar with no groups showed no toolbar, and could hide every chat you had.** The Ungrouped heading was held back until a group existed, on the reasoning that a lone "Ungrouped" label above every chat says nothing. The heading is also what carries the plus, the search and the sort — so on an install with no groups none of them were reachable, and the menu that makes the first group sat inside the thing that only appears once a group exists. Worse, collapsing Ungrouped is remembered: collapse it, then end up with no groups, and the whole list is gone with no control left to open it. The heading always renders now. It still cannot strand itself above nothing, because a section with no chats is not drawn at all
- **A search could not see into a collapsed group.** Matches inside one were absent from the results, and the list looked complete — so a chat you were searching for appeared not to exist. Collapse is a preference, not a filter: it yields while a search or persona filter is on
- **The chat you are reading is visible where it lives**, even when its section is collapsed. A brand new chat went into a collapsed section and simply did not appear, so starting one looked like nothing had happened. Neither this nor the search case writes the preference back, so a section returns to how it was left

## [5.7.0] - 2026-09-30

### ✨ Added

- **A chat says what it is doing, so the sidebar is worth looking at.** A thread that finished while you were reading another one looked exactly like a thread you had already dealt with, so the only way to find out was to open each in turn. Every row carries a dot: pulsing while the assistant is working, blue once a turn has finished that you have not seen, empty when you have. A thread you are reading never turns blue at you, and one that hit its iteration limit or errored is marked apart from one that simply finished. Work an agent does over MCP pulses the same way, so a thread an agent is writing into looks busy while it is busy
- **Chats file into groups.** Create, rename, reorder and collapse them, drag a chat from one group into another, and drag a group itself into place. A group's **+** opens a chat that is already in that group — filed as the chat is created, so a turn that errors or that you navigate away from is still filed. Deleting a group returns its chats to Ungrouped rather than taking them with it
- **The list has a toolbar.** Filter by persona, sort by activity or by title, and search the list from the panel
- **The thread title heads the conversation**, with rename, sharing and delete in its menu

### 📝 Changed

- **Sharing is in one place.** It was in the header and again on every sidebar row. The header's control is gone and the thread title's menu carries it
- **The product name moved into the side panel**, above **New Chat**, which leaves the header to the thread you are actually reading
- **The persona chip joined the connection and source controls** on the right of the header, with no fill
- **The sidebar reads as a hierarchy.** A row and the heading above it drew from one color a shade apart, so the panel read flat. A row takes the primary text color at 14px and a heading the muted one at 12px
- **Type weight is lighter throughout.** `font-medium` and `font-semibold` are set once in the theme, so 153 places that mark a chip or a card title stopped setting it heavier than the text beside them
- **Pointing at a row no longer looks like being in it.** Hover and the open row used the same fill; hover is translucent now
- **A message bubble is 38px tall rather than 54px** for a single line, which was two paddings stacking

### 🐛 Fixed

- **Deleting the chat you are reading leaves it.** The sidebar read the open chat from the route params, which `history.replaceState` leaves behind, so on a chat you had just started nothing was highlighted and deleting it left you sitting on a chat that no longer existed
- **A chat deleted while the request failed no longer disappears and comes back.** The success branch ran on a `403` as readily as on a `200`
- **A dialog dims to the edge of the window.** The page reserved a scrollbar gutter that the browser paints itself, leaving a bright strip down the right that no overlay could cover. Nothing scrolls the document, so nothing is reserved
- **A skill chip shows its name.** `truncate` sat on a flex box, where the name is not a block and clips with no ellipsis
- **The collapse control collapses.** Clicking it replaced it with the expand control under the cursor, which opened the panel again 17ms later
- **The panel stops appearing over the canvas while it opens.** The gap and the panel ran on different curves, so the panel's edge arrived where the canvas was not

### 🗄️ Database

- `0039_chat_activity_state` — `Stream.finishedAt`, `Stream.outcome`, `Chat.updatedAt`, `Chat.lastViewedAt`, backfilled so history opens quiet rather than claiming every thread is unread
- `0040_chat_groups` — `ChatGroup`, and `Chat.groupId` with `ON DELETE SET NULL`
- `0041_chat_agent_active` — `Chat.agentActiveAt`, stamped by MCP appends

## [5.6.0] - 2026-09-28

### ✨ Added

- **An agent writes skills, not only personas.** A connected AI could already read this workspace's skills and write nothing back, so a research loop that established how a task is done in one NetSuite account ended with that knowledge in a transcript. `osmcp_create_skill` saves it, `osmcp_update_skill` revises it across attempts, and `osmcp_delete_skill` withdraws it. An agent set loose to test an approach until it holds the recipe now ends that session with the recipe saved, and the next session starts from it
- **A new skill is invoked by name rather than applied to every turn.** `osmcp_create_skill` writes at **Slash**, so a skill an agent wrote while researching one task does not sit on top of every unrelated prompt its owner types afterwards. It stays listed by `osmcp_list_skills`, so the agent that wrote it can read it back. Pass `mode: "auto"` to apply it always. A skill a person adds in the Skills panel still starts at **Auto**
- **A persona carries the skills it works by.** `osmcp_pair_skills` sets what any persona carries — built-in or custom, and any skill from any of the four sources. Those skills are injected for every turn that persona works, even at **Slash**, so a specialist and its practice arrive together. `osmcp_create_skill` takes `pairWith` to write and attach in one call. In the app, pairing is the **Skills** tab of the persona editor, with a search box rather than a list of everything. Opening a built-in persona there shows its instructions read-only and its skills editable, because the instructions are a file on disk and the pairing is yours
- **Clone, so a refusal is a fork rather than a dead end.** `osmcp_clone_skill` and `osmcp_clone_persona` copy anything the user can read — a built-in persona, a skill a colleague wrote, a skill an organization published — into something the agent may then revise. The Skills and Personas panels have the same action, including on organization rows, which previously offered nothing at all. A cloned persona carries the same skills as its original
- **Skills carry an `authoredBy` stamp.** The Skills panel credits an agent-written skill to the agent, and `osmcp_list_skills` reports it alongside `managedByOrg` and `carriedBy`. An agent may revise or delete what agents wrote — never a skill a person wrote, and never one an organization administrator published
- **Markdown renders where it is read.** An eye toggle in the persona editor, the persona details dialog and the skill editor switches between the source and the rendered document

- **A skill can be a folder, not only a document.** `SKILL.md` is the entry point and the material it points at — intake questions, troubleshooting tables, worked patterns — sits in files beside it. `osmcp_get_skill` returns the entry point and names the rest; `osmcp_read_skill_file` reads one when the instructions call for it, rather than pulling everything in advance. A person imports a folder as a `.zip` in **Skills** and downloads one the same way. Up to 32 files, 64,000 characters each, 256,000 for the whole skill
- **Skills carry a description.** One line, shown in the Skills panel and returned by `osmcp_list_skills`. An agent choosing which skills a persona should carry was reading 32 entries that all said “Custom skill” and had to open each one. Skills written before the field existed fall back to their `SKILL.md` frontmatter
- **Skills say which agent wrote them.** The app's name and the product it connected from, with the NetSuite account it was acting against and when — rather than the bare word “agent”. `osmcp_list_skills` reports it as `writtenBy`
- **A skill's references are readable in the app, not only over MCP.** SKILL.md is what gets injected for a turn; the material it points at stays on disk until something asks for it. The chat has a `readSkillFile` tool now, and an injected skill ends by naming the files it carries — without both, a pack whose instructions say “run references/intake.md” told the model to open a file it had no way to reach. In the Skills panel each reference opens where it is listed
- **A skill can be downloaded.** A skill with references comes back as a `.zip` of the folder; one without comes back as a single `SKILL.md`, with frontmatter so a re-import keeps its name and description

- **Prompts, so a capability of this server is visible to the person using it.** This server published tools and nothing else, which means everything it can do was addressed to the model and none of it to the human in the client. `prompts/list` and `prompts/get` are implemented and the capability is advertised, so Claude, Cursor and any other client render them in their own `/` menu. Four workflows ship: start a NetSuite task, choose the right specialist, record this session, save what you learned as a skill. Each is the opening sequence a model will not run unprompted — confirm identity, adopt the persona, read its skills, open a thread
- **Every prompt your NetSuite Companion library publishes is listed with them**, named `netsuite_…`, with each detected blank as an argument. A NetSuite prompt becomes something to pick in your AI client rather than something to go and look up. The built-in four are listed on their own when no account is connected or the library tool is switched off, because a list that errored would show the person nothing at all

### 📝 Changed

- **What a connecting agent is told is shorter and in priority order.** The instructions sent at `initialize` had grown to eleven sentences, arriving once, in a system prompt competing with everything else — and recording work was the ninth of them. They are six now, and what a tool's own description already says was removed rather than repeated. The habits that nothing in a tool name implies — read your persona, open a thread, save what you establish — are also returned by `osmcp_whoami` as `nextSteps`, which is the one call every session makes first
- **Deleting names what it releases.** Removing a skill lists the personas that carried it, in the app and in the tool result, and they keep working without it. Removing a persona releases its pairings and leaves every skill in the library. Switching a paired skill **Off** asks first, because a persona carrying an off skill would inject nothing
- **Pairings are stored once, keyed by persona.** A built-in persona is a prompt file on disk with nowhere to hold a field, so the map covers built-in and custom alike and every read site does one lookup

### 🐛 Fixed

- **A synced skill keeps the files beside its SKILL.md.** The Connected, Oracle and Community syncs walked a repo, took `SKILL.md`, and discarded everything else in the folder — so a pack whose instructions say “run `references/intake.md`” arrived pointing at a file this install had thrown away. Text files beside a SKILL.md are now synced with it
- **An organization's published skills no longer eat your own allowance.** The Skills panel sends org-published and personal skills back as one array, and the whole array was capped at 32 — so five published skills silently reduced a member to 27 of their own, and the 28th save returned a bare `400`. The cap counts personal skills, on both the panel and the MCP path, and says so when it bites
- **`README.md` describes the release it ships with.** `## What’s in 5.3` headed 5.5 content and the file went 5.3 → 5.2 → 5.0, so two releases had no section at all. 5.3, 5.4 and 5.5 are written, and the promotion checklist in `docs/getting-started.md` now requires the section before a release reaches public `main`
- **Changelog version links resolve.** Eleven version headings had no link reference and rendered as literal brackets

### 📦 Database

- Migration `0037_persona_skill_pairings` — `UserSettings.personaSkillIds` (`pnpm db:migrate`)
- Migration `0038_user_skill_files` — `UserSkillFile`, the reference files beside a custom skill's SKILL.md. A table rather than another JSONB field, because the settings row is read on every chat turn and a bundle's references are large and read rarely

---

## [5.5.0] - 2026-09-27

### ✨ Added

- **An agent app is the application, and it signs in.** Every install is its own OAuth 2.1 authorization server at its own address — self-hosted, sandbox and cloud alike, with nothing to register anywhere. Press **New app** under **App Portal → Agent apps**, paste the Server URL into Claude, Cursor, Gemini or ChatGPT, and approve it on a consent screen here. The discovery half shipped earlier with nothing behind it; `authorization_servers` was the missing field, and without it every client fell back to asking for a pasted token
- **One dialog holds an app.** Name, the product it connects from, persona, pinned NetSuite account, note, and its credential — created, read back, rotated and revoked in the same place. An OAuth client used to be a second object in a second tab, which read as two kinds of thing when it is one
- **A credential can be read again.** A **Bearer auth** token and an **OAuth 2.1** client secret are both stored encrypted and revealed on demand, and a secret rotates in place while the client id stays. Needing a fresh credential no longer means deleting the app and rebuilding its name, persona, pinned account and history
- **An app says which AI it is for.** **Connects from** is set when the app is created and fixed afterwards. It shows on the card, filters the list, fills the callback URL for a connector that asks for a client id and secret, and pre-selects the matching app on the consent screen when exactly one matches
- **Three ways for a client to identify itself.** Client Identifier Metadata Documents, which revision `2026-07-28` prefers; dynamic registration, which that revision deprecates and shipping clients still use; and a client id and secret issued by the app itself. PKCE with `S256` throughout, and a loopback redirect matches without its port, which RFC 8252 §7.3 requires
- **[Connect an agent](https://opensuitemcp.com/docs/connect-an-agent) covers Claude, Cursor, Gemini and ChatGPT.** Each was connected end to end before it was written down, and each set of steps names the application it happens in, because connecting crosses between two

### 🔒 Security

- **A refresh token could be used as an access token, and the other way round.** Both kinds live in one table and share one id namespace, and the code decided which kind it held from the prefix the caller sent rather than the stored row. Re-labelling a refresh token `osmcp_at_` produced a working MCP credential with the refresh token's sixty-day lifetime — one that survived its own rotation, and one reuse detection could never see, because it was never presented to the token endpoint. Every lookup is constrained to the kind on the row, and `scripts/oauth-security-regression.ts` fails if it returns
- **Discovery documents are no longer cached when their contents can be steered.** Each embeds this install's origin as `issuer` and `token_endpoint`, and without `AUTH_URL` that origin comes from `X-Forwarded-Host` — while the response said `Cache-Control: public`. A shared cache could be handed a document built from someone else's header and serve it to real clients, who would then post their authorization code to whatever endpoint it named. Public caching now requires a pinned origin, and `Vary` is sent either way
- **The client metadata document fetch cannot be pointed at your own network.** `/api/oauth/token` takes a `client_id` from an unauthenticated caller and fetches it, which made it a request forwarder into the database host, the Docker network, or a cloud metadata service on `169.254.169.254`. Every address a name resolves to must be publicly routable, the body is capped at 64 KB, and the work counts against a shared budget as well as a per-client one
- **A replayed authorization code revokes nothing until the caller proves possession of the PKCE verifier.** Revoking first meant a leaked code plus a public `client_id` was enough to kill a victim's live tokens without proving anything
- **A redirect URI must be https, loopback, or a private-use scheme.** `javascript:`, `data:`, `vbscript:`, `file:`, `blob:` and `about:` are refused — an authorization code is appended to whatever the server redirects to

### 📝 Changed

- **An app already holding a credential can be connected again.** A client removed at the other end keeps its tokens and never calls the revocation endpoint, so "connected" only ever meant "we issued a credential and have heard nothing since". Treating that as unavailable left every app bound to a connector that no longer existed and nothing able to connect. The consent screen offers every app, names the client holding each one, and warns that choosing it signs that holder out; connecting revokes what the previous client held
- **The card states what this install knows.** "Credential held by Claude" rather than "Signed in", and "Not connected" rather than "Awaiting connection". Whether a client still has an app configured is not something the protocol reports, and **Last used** is the signal that a connector is gone
- **The connection how-to is written once.** It lived in six places and had drifted — one copy told VS Code and Gemini CLI to send a header neither reads. `lib/mcp/connect-clients.ts` is the only copy; the markdown is generated from it and `scripts/generate-connect-doc.ts --check` fails a build that has let them diverge

### 🐛 Fixed

- **Claude, ChatGPT and Cursor could not register at all.** Each was refused for something it never needed here: Claude advertises `urn:ietf:params:oauth:grant-type:jwt-bearer` beside the two grants it uses, ChatGPT asks for a `token_endpoint_auth_method` this server does not implement, and Cursor registers `cursor://anysphere.cursor-mcp/oauth/callback`, a private-use scheme RFC 8252 §7.1 allows. A client states what it can do, not what it needs from us: unsupported grants, response types and redirect URIs are dropped, the registration response echoes what was kept, and a client is refused only when nothing usable remains
- **Replacing a client secret no longer takes the app down.** Rotation returned a different shape from the read it replaced, and the dialog read a field that was not there — inside an effect, so the whole page fell to the error screen
- **An app keeps the product it was created for.** The value was validated, passed down, and dropped: the insert never listed the column, so every app came back unlabeled however the form was filled
- **Editing a bearer app saves its note and its pinned account.** Both were parsed by the route and forwarded to nothing, so the dialog reported success and changed neither
- **A refused registration is recorded.** The client shows its own wording and the install kept no trace of what was actually sent
- **The protected resource metadata stopped advertising scopes it does not enforce.** It offered `read` and `write`, which stopped existing when per-key scopes were dropped in migration `0026`. One scope, `mcp`

---

## [5.4.2] - 2026-09-25

### ✨ Added

- **A long result or script opens beside the conversation instead of inside it.** A NetSuite result renders into a code block, inside a collapsed tool card, inside a chat bubble; a script the model writes lands in a fence in the same column. Either way there is about forty characters of width in which to read a vendor ledger or a fifty-line UserEventScript. Results and fences past a dozen lines now offer a canvas: the conversation keeps its place on the left and stays usable, and the content takes a resizable pane on the right with copy and download of its own. A split rather than a dialog — a dialog over the conversation would trade one unreadable thing for another. Desktop only: a split pane needs a second column to split into, and a phone has one

### 🐛 Fixed

- **An unreachable Oracle no longer stops the app starting.** The container entrypoint syncs the Oracle skill packs before the server starts, under `set -e`, and the sync exited non-zero when the fetch failed — so a third-party outage, or a firewall rule on the way out, became an app that never came up at all, repeating its boot and re-running migrations every few seconds. Reported now instead, which is the answer the Community sync beside it already gave. Skills stay at the last pack that synced
- **The main column no longer pushes past the room the sidebar leaves it.** It is a flex item with no minimum width, so `min-width: auto` applied and content wider than the space available pushed the column past it. Nothing showed while every child was centered and clipped; anything sitting flush against the right edge left the viewport by the width of the collapsed sidebar rail
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
- **`osmcp_list_personas` honors organization persona policy.** An agent acting for a member of an organization that narrows the builtin personas could see all of them
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

[5.10.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.10.0
[5.9.1]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.9.1
[5.9.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.9.0
[5.8.2]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.8.2
[5.8.1]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.8.1
[5.8.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.8.0
[5.7.1]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.7.1
[5.7.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.7.0
[5.6.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.6.0
[5.5.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.5.0
[5.4.2]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.4.2
[5.4.1]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.4.1
[5.4.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.4.0
[5.3.1]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.3.1
[5.3.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.3.0
[5.2.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.2.0
[5.0.1]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.0.1
[5.0.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v5.0.0
[4.1.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v4.1.0
[4.0.2]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v4.0.2
[4.0.1]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v4.0.1
[4.0.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v4.0.0
[3.1.1]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v3.1.1
[3.1.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v3.1.0
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
