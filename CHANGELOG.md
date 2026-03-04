# Changelog

All notable changes to OpenSuiteMCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[2.6.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v2.6.0
[2.5.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v2.5.0
[2.4.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v2.4.0
[2.3.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v2.3.0
[2.2.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v2.2.0
[2.1.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v2.1.0
[2.0.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v2.0.0
[1.1.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v1.1.0
[1.0.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v1.0.0
