# Installation Guide

## Quick Start for Future Users

### Prerequisites

- Node.js v18+
- NetSuite account with OAuth 2.0 integration configured
- OpenAI, Anthropic, or Google AI API key

### 1. Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd opensuitemcp

# Install backend dependencies
cd server
npm install

# Install frontend dependencies (in new terminal)
cd ../client
npm install
```

**That's it!** All correct versions are in `package.json`:

**Backend AI Dependencies:**

- ✅ `langchain@^0.3.35` - LangChain core framework
- ✅ `@langchain/openai@^0.6.14` - OpenAI provider
- ✅ `@langchain/anthropic@^0.3.30` - Anthropic provider
- ✅ `@langchain/google-genai@^0.2.18` - Google Gemini provider
- ✅ `@langchain/core@^0.3.78` - LangChain utilities
- ✅ `zod@^3.25.76` - Type-safe schemas

**AI SDK Dependencies (for model listing):**

- ✅ `openai@^4.20.0` - OpenAI SDK
- ✅ `@anthropic-ai/sdk@^0.16.0` - Anthropic SDK
- ✅ `@google/generative-ai@^0.24.1` - Google AI SDK

### 2. Environment Setup

Create `server/.env`:

```env
PORT=3001
SESSION_SECRET=your-secure-random-string-here
NODE_ENV=development
CLIENT_URL=http://localhost:5173
API_URL=http://localhost:3001
```

### 3. Run Development Servers

**Backend:**

```bash
cd server
npm run dev
```

**Frontend** (in new terminal):

```bash
cd client
npm run dev
```

### 4. Configure NetSuite Integration

See [README.md](./README.md#netsuite-configuration) for detailed OAuth setup.

## Why LangChain?

### LangChain Framework

- ✅ **Agent Architecture** - Multi-step reasoning with tool execution
- ✅ **Provider Agnostic** - Works with OpenAI, Anthropic, Google, and more
- ✅ **Streaming Built-in** - Native streaming support for real-time responses
- ✅ **Type-safe Tools** - Zod schemas for runtime validation
- ✅ **Production Ready** - Battle-tested framework with active community

### Why These Specific Versions?

#### `langchain@^0.3.35`

- ✅ **Latest stable** - Most recent production version
- ✅ **Full agent support** - `createToolCallingAgent` and `AgentExecutor`
- ✅ **Streaming support** - Native streaming with all providers
- ✅ **TypeScript support** - Full type safety

#### `@langchain/openai@^0.6.14`, `@langchain/anthropic@^0.3.30`, `@langchain/google-genai@^0.2.18`

- ✅ **Latest provider packages** - Independent versioning
- ✅ **Full model support** - Including latest GPT, Claude, and Gemini models
- ✅ **Streaming enabled** - Real-time token streaming

#### `zod@^3.25.76`

- ✅ **LangChain peer dependency** - Required for tool schemas
- ✅ **Mature and stable** - Well-tested validation library
- ✅ **Full TypeScript support** - Type inference from schemas

## Common Installation Issues

### Issue: "Module not found: @langchain/openai"

**Cause**: Provider packages not installed
**Fix**:

```bash
cd server
npm install @langchain/openai @langchain/anthropic @langchain/google-genai
```

### Issue: "zod peer dependency conflict"

**Cause**: Incompatible zod version
**Fix**:

```bash
cd server
npm install zod@^3.25.76
```

### Issue: "Cannot find module 'langchain/agents'"

**Cause**: Missing langchain core package
**Fix**:

```bash
cd server
npm install langchain @langchain/core
```

## Verifying Installation

After `npm install`, check your versions:

```bash
# Backend
cd server
npm list langchain @langchain/openai @langchain/anthropic @langchain/google-genai zod

# Frontend
cd client
npm list react vite tailwindcss
```

Expected backend output:

```
openmcp-server@1.0.0
├── langchain@0.3.35
├── @langchain/openai@0.6.14
├── @langchain/anthropic@0.3.30
├── @langchain/google-genai@0.2.18
├── @langchain/core@0.3.78
└── zod@3.25.76
```

Expected frontend output:

```
openmcp-client@1.0.0
├── react@18.2.0
├── vite@5.0.0
└── tailwindcss@3.3.5
```

## Technology Stack Overview

### Backend

**Core Framework:**

- Express.js for web server
- LangChain for AI orchestration
- Express-session + file store for session persistence

**AI Providers:**

- OpenAI (GPT models)
- Anthropic (Claude models)
- Google (Gemini models)

**MCP Integration:**

- Direct NetSuite MCP REST API
- Axios for HTTP requests
- JSON-RPC 2.0 protocol

### Frontend

**Core Framework:**

- React 18 for UI
- Vite for build tooling
- Tailwind CSS for styling

**Features:**

- Custom SSE streaming client
- Dark mode support
- Responsive design
- Markdown rendering

## Next Steps

1. ✅ Configure NetSuite OAuth integration
2. ✅ Connect to NetSuite in the app
3. ✅ Configure AI provider (OpenAI, Anthropic, or Google)
4. ✅ Start asking questions!

See [README.md](./README.md) for full documentation.

## Development Notes

### Hot Reload

Both frontend and backend support hot reload:

- **Frontend**: Vite HMR (instant)
- **Backend**: Nodemon (restarts on file changes)

### Debugging

**Backend logs** show:

- Session activity
- MCP tool calls
- AI provider requests
- Agent execution steps

**Frontend logs** show:

- Streaming chunks received
- State updates
- API calls

### Project Structure

```
opensuitemcp/
├── server/               # Backend
│   ├── src/
│   │   ├── routes/      # API endpoints
│   │   ├── services/    # Business logic
│   │   └── middleware/  # Express middleware
│   └── sessions/        # Session storage (gitignored)
│
└── client/              # Frontend
    ├── src/
    │   ├── components/  # React components
    │   └── App.jsx      # Main app
    └── public/          # Static assets
```

## Troubleshooting

### Backend won't start

1. Check Node version: `node --version` (should be 18+)
2. Check .env file exists with SESSION_SECRET
3. Check port 3001 is available
4. Look for errors in console

### Frontend won't start

1. Check Node version: `node --version` (should be 18+)
2. Check port 5173 is available
3. Clear Vite cache: `rm -rf node_modules/.vite`
4. Look for errors in console

### Dependencies won't install

1. Clear npm cache: `npm cache clean --force`
2. Delete node_modules and package-lock.json
3. Run `npm install` again
4. Check Node version compatibility

## Additional Resources

- [LangChain Documentation](https://js.langchain.com/docs/)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [NetSuite OAuth Documentation](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_157794450636.html)
- [Model Context Protocol](https://modelcontextprotocol.io/)

---

**Installation Complete!** 🎉

Now head to [README.md](./README.md) to learn how to configure and use the application.
