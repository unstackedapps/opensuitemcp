# <img src="./app/icon.svg" alt="OpenSuiteMCP Icon" width="24" height="24" style="margin-right: 4px; vertical-align: baseline; margin-top: 2px;" /><span style="font-weight: 200;">OpenSuite</span>MCP NetSuite AI Assistant

An AI-powered chat assistant that integrates with NetSuite via MCP (Model Context Protocol), enabling natural language interactions with your NetSuite data. Built with Next.js, Vercel AI SDK, and supporting multiple AI providers (Google Gemini, Anthropic Claude, and OpenAI GPT).

<img src="./docs/screenshot.png" alt="OpenSuiteMCP Main UI" width="80%" />

## Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- PostgreSQL database
- Docker (optional, for local development with SearXNG)

### Setup

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Run automated setup:**

   ```bash
   pnpm setup:backend
   ```

   This generates secrets, creates `.env.local`, and optionally starts Docker containers (PostgreSQL, Redis, and SearXNG).

3. **Run database migrations:**

   ```bash
   pnpm db:migrate
   ```

4. **Start the development server:**

   ```bash
   pnpm dev
   ```

5. **Configure your API key:**
   - Open the **Settings** modal from the sidebar
   - Enter your AI provider API key (Google, Anthropic, or OpenAI)
   - API keys are encrypted and stored securely in your database

The app will be running at [http://localhost:3000](http://localhost:3000).

## Documentation

- **[LICENSE](LICENSE)** - Full license terms and usage restrictions
- **[NOTICE.md](NOTICE.md)** - Usage notice and commercial restrictions
- **[ATTRIBUTION.md](ATTRIBUTION.md)** - Open source attributions and credits
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and release notes
