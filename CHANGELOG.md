# Changelog

All notable changes to OpenSuiteMCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[2.0.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v2.0.0
[1.1.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v1.1.0
[1.0.0]: https://github.com/unstackedapps/opensuitemcp/releases/tag/v1.0.0
