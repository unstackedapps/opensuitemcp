# OpenSuiteMCP - Open Source NetSuite MCP Client

An open source, production-ready NetSuite MCP (Model Context Protocol) client that uses OAuth 2.0 with PKCE authentication to provide secure, intelligent access to NetSuite data through AI-powered natural language queries.

## 🌟 Features

- **OAuth 2.0 with PKCE**: Same secure authentication flow as Postman and Claude MCP
- **Native MCP REST API**: Uses NetSuite's built-in MCP endpoint (no local server needed!)
- **LangChain AI Framework**: Production-ready AI orchestration with streaming, tools, and agents
- **100% AI-First**: AI makes ALL decisions - tool selection, SQL generation, result formatting
- **Natural Language Queries**: Just ask in plain English - no SQL knowledge required!
- **Streaming Responses**: Real-time AI responses with better UX
- **Automatic Conversation Memory**: Multi-turn conversations with full context
- **Type-Safe Tools**: MCP tools with Zod validation
- **Persistent Sessions**: Everything saved - survives page reloads and server restarts
- **Modern UI**: Beautiful React interface with Tailwind CSS and dark mode
- **Multi-AI Support**: Choose from OpenAI, Anthropic (Claude), or Google Gemini

## ⚡ Powered by LangChain

This app uses **LangChain** for optimal AI orchestration:

### Backend (LangChain)

- **Streaming Responses**: Real-time word-by-word streaming with agent executors
- **Built-in Tool Calling**: Type-safe tool definitions with Zod schemas
- **Automatic Context Management**: Full conversation history passed to AI
- **Provider Agnostic**: Switch between OpenAI, Anthropic, or Google easily
- **Agent Architecture**: Multi-step reasoning with tool execution

### Frontend (Custom Streaming Client)

- **Simple & Reliable**: Custom fetch with Server-Sent Events (SSE) parsing
- **Session Persistence**: Conversations saved to backend session storage
- **Manual Clear**: Clear button to reset conversation
- **Real-time Tool Visibility**: Watch MCP tools execute in real-time

### Why LangChain?

**Key Benefits:**

- **Production-ready** agent framework with streaming support
- **Type-safe tools** with Zod validation
- **Multi-step reasoning** - AI can call multiple tools sequentially
- **Extensive provider support** - Works with any LLM provider
- **Active community** and comprehensive documentation

## 🤖 AI-First Approach

This is **not** a regex-based chatbot. The AI handles everything:

### How a Query Works

**You ask**: "How many customers do I have?"

1. **AI Analyzes**: Understands you want customer count data
2. **AI Decides**: Chooses `ns_runCustomSuiteQL` tool
3. **AI Generates**: Creates `SELECT COUNT(*) FROM customer`
4. **MCP Executes**: NetSuite runs the query
5. **AI Formats**: Returns "You have 42 customers in your account!"

**No hardcoded patterns. No regex. Pure AI reasoning.**

### What the AI Does

- 🧠 **Understands Intent**: Natural language → tool selection
- 🔧 **Generates SQL**: Plain English → SuiteQL queries
- 📊 **Formats Results**: Raw data → conversational responses
- 🎯 **Handles Context**: Remembers conversation flow
- ⚡ **Adapts**: Works with ANY query, not just predefined patterns

## 🏗️ Architecture

```
opensuitemcp/
├── server/                  # Backend (Express.js + LangChain)
│   ├── src/
│   │   ├── app.js          # Main application entry point
│   │   ├── middleware/     # Session & error handling
│   │   ├── routes/         # API endpoints (auth, chat, mcp, provider)
│   │   └── services/       # Business logic (auth, mcp, AI)
│   └── package.json
│
├── client/                  # Frontend (React + Vite)
│   ├── src/
│   │   ├── App.jsx         # Main app component
│   │   ├── components/     # UI components
│   │   └── main.jsx        # Entry point
│   └── package.json
│
└── README.md
```

## 📋 Prerequisites

- Node.js (v18 or higher)
- NetSuite account with OAuth 2.0 integration configured
- **OpenAI API key, Anthropic API key, OR Google AI API key** (required for AI-first NLQ functionality)

## 🚀 Setup Instructions

### 1. NetSuite Configuration

1. Log into NetSuite
2. Go to **Setup > Integration > Manage Integrations**
3. Click **New**
4. Configure the integration:
   - **Name**: NetSuite AI Assistant
   - **State**: Enabled
5. **Token-based Authentication** section:
   - **Uncheck all options** under Token-based Authentication
6. **OAuth 2.0** section:
   - Check **Authorization Code Grant**
   - Check **Public Client**
   - **Redirect URI**: `http://localhost:3001/api/auth/callback`
   - **Scope**: Select **NetSuite AI Connector Service**
7. Click **Save**
8. After saving, note your **Client ID** and **Account ID** (Account ID is in your NetSuite URL, e.g., `1234567` from `1234567.app.netsuite.com`)

> **💡 Important**: Since we're using **Public Client** and **Authorization Code Grant** with PKCE, you do NOT need a Client Secret. The PKCE flow provides security without requiring a client secret.

### 2. Backend Setup

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Create environment file
cp env.example .env

# Edit .env and add your configuration
# SESSION_SECRET=your-secure-random-string
# CLIENT_URL=http://localhost:5173
# API_URL=http://localhost:3001
```

### 3. Frontend Setup

```bash
# Navigate to client directory
cd client

# Install dependencies
npm install
```

### 4. No Additional MCP Setup Needed!

This application uses **NetSuite's native MCP REST API** - no local MCP server installation required! Once you authenticate with OAuth, the app automatically connects to:

`https://{accountId}.suitetalk.api.netsuite.com/services/mcp/v1/all`

## 🎮 Running the Application

### Development Mode

**Terminal 1 - Backend:**

```bash
cd server
npm run dev
```

**Terminal 2 - Frontend:**

```bash
cd client
npm run dev
```

The application will be available at:

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## 📖 How to Use

### 1. Connect to NetSuite

1. Click the **Settings** icon (⚙️) in the header
2. Go to the **NetSuite Connection** tab
3. Enter your:
   - **Account ID** (e.g., 1234567)
   - **OAuth 2.0 Client ID**
   - **Scope** should already be set to `mcp` (default)
4. Click **Connect with OAuth 2.0**
5. A popup window will open for NetSuite authorization
6. Log in and authorize the application
7. The popup will close and you'll be connected

### 2. Configure AI Provider (Required)

1. Click the **Settings** icon
2. Go to the **AI Provider** tab
3. Select your provider:
   - **OpenAI**: Uses GPT models for tool selection, SQL generation, and result formatting
   - **Anthropic**: Uses Claude models for tool selection, SQL generation, and result formatting
   - **Google**: Uses Gemini models for tool selection, SQL generation, and result formatting
4. Enter your API key
5. Click **Save AI Configuration**

> **⚠️ Important**: This is an AI-first application. An AI provider (OpenAI, Anthropic, or Google) is **required** for the natural language query functionality to work. The AI:
>
> - Understands your natural language queries
> - Decides which NetSuite MCP tool to use
> - Generates SuiteQL queries automatically
> - Formats results in a conversational way

### 3. Query NetSuite Data

Once connected, ask anything in plain English:

- **Simple Queries**: "How many customers do I have?"
- **Data Exploration**: "Show me all my customers"
- **Reports**: "What reports are available?"
- **Saved Searches**: "List my saved searches"
- **Complex Analysis**: "Get transactions from the last 30 days"
- **Direct SQL** (if you prefer): "SELECT \* FROM customer FETCH FIRST 5 ROWS ONLY"

**The AI understands your intent and:**

- Chooses the right tool
- Generates proper SQL
- Formats results beautifully

## 🔧 Available MCP Tools

The application provides access to these NetSuite MCP tools:

1. **ns_runReport**: Run a NetSuite report
2. **ns_listAllReports**: List all available reports
3. **ns_listSavedSearches**: List saved searches
4. **ns_runSavedSearch**: Run a saved search
5. **ns_runCustomSuiteQL**: Execute SuiteQL queries

View available tools in the **MCP Tools** tab of the configuration panel.

## 🔐 Security Features

### OAuth 2.0 with PKCE

- **No stored credentials**: Tokens are session-based
- **PKCE flow**: Protection against authorization code interception
- **Secure sessions**: HTTP-only cookies with configurable expiration
- **Token refresh**: Automatic token renewal

### Production Considerations

- Use HTTPS in production
- Implement CSRF protection
- Add rate limiting
- Use Redis for session storage
- Encrypt sensitive data at rest
- Add request logging and monitoring

## 💾 Session Persistence

The app now **automatically saves and restores** your connection:

### What's Saved (localStorage)

- ✅ NetSuite Account ID
- ✅ OAuth Client ID
- ✅ Scope preference
- ✅ AI Provider preference (type only, not API key)

### What's Not Saved (Security)

- ❌ Access tokens (server-side session only)
- ❌ Refresh tokens (server-side session only)
- ❌ AI API keys (must re-enter after server restart)

### How It Works

1. **First Connection**: Enter credentials, authenticate via OAuth
2. **Page Reload**: App checks for active session automatically
3. **Session Valid**: Reconnects instantly (no re-auth needed)
4. **Session Expired**: Prompts you to reconnect (credentials pre-filled)

Sessions last **7 days** and survive:

- ✅ Page refreshes
- ✅ Browser restarts
- ✅ Tab closes/reopens
- ✅ **Server restarts** (sessions stored on disk!)
- ✅ MCP auto-reconnect (tools automatically reload)

## 🎯 Key Differences from Basic Auth

| Feature           | Basic Auth            | OAuth 2.0 with PKCE     |
| ----------------- | --------------------- | ----------------------- |
| Security          | API keys stored       | No credentials stored   |
| User Experience   | Manual setup          | One-click authorization |
| Token Management  | Static                | Auto-refresh            |
| MCP Compatibility | Custom implementation | Native MCP server       |
| Production Ready  | No                    | Yes                     |

## 🛠️ API Endpoints

### Authentication

- `POST /api/auth/connect` - Initiate OAuth flow
- `GET /api/auth/callback` - OAuth callback handler
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/status` - Check auth status
- `POST /api/auth/disconnect` - Disconnect session

### MCP Tools

- `GET /api/mcp/tools` - List available tools
- `POST /api/mcp/execute` - Execute a tool

### Chat

- `POST /api/chat/message` - Send message to AI (streaming)
- `GET /api/chat/history` - Get conversation history
- `POST /api/chat/history` - Save conversation history
- `POST /api/chat/clear` - Clear conversation

### Provider

- `POST /api/provider/configure` - Configure AI provider
- `POST /api/provider/models` - Fetch available models

## 📦 Dependencies

### Backend

- `express` - Web framework
- `express-session` - Session management
- `session-file-store` - Persistent session storage (survives server restarts)
- **`langchain@^0.3.35`** - LangChain core framework
- **`@langchain/openai@^0.6.14`** - OpenAI provider for LangChain
- **`@langchain/anthropic@^0.3.30`** - Anthropic provider for LangChain
- **`@langchain/google-genai@^0.2.18`** - Google Gemini provider for LangChain
- **`@langchain/core@^0.3.78`** - LangChain core utilities
- **`zod@^3.25.76`** - Type-safe schema validation for tools
- `axios` - HTTP client
- `@modelcontextprotocol/sdk` - MCP SDK
- `cors` - CORS handling
- `openai` - OpenAI SDK (used by aiService for model listing)
- `@anthropic-ai/sdk` - Anthropic SDK (used by aiService for model listing)
- `@google/generative-ai` - Google AI SDK (used by aiService for model listing)

### Frontend

- `react` - UI framework
- `vite` - Build tool
- `tailwindcss` - Styling (with dark mode)
- `lucide-react` - Icons
- `react-markdown` - Markdown rendering
- `remark-gfm` - GitHub Flavored Markdown

## 🚦 Production Deployment

### Environment Variables

```env
# Production
NODE_ENV=production
PORT=3001
SESSION_SECRET=your-production-secret

# URLs
CLIENT_URL=https://your-domain.com
API_URL=https://api.your-domain.com
```

### Recommended Enhancements

1. **Security**

   - Enable HTTPS
   - Implement CSRF tokens
   - Add rate limiting (e.g., express-rate-limit)
   - Use Helmet.js for security headers

2. **Scalability**

   - Use Redis for session storage
   - Add queue system for long-running queries
   - Load balancing for multiple instances

3. **Monitoring**

   - Add logging (Winston, Morgan)
   - Implement error tracking (Sentry)
   - Track analytics
   - Monitor API health

4. **Performance**
   - Cache frequent requests
   - Implement request throttling
   - Add CDN for static assets

## 🐛 Troubleshooting

### OAuth Connection Issues

- Verify redirect URI matches NetSuite configuration exactly: `http://localhost:3001/api/auth/callback`
- Check that Account ID and Client ID are correct
- Ensure NetSuite integration has **NetSuite AI Connector Service** scope selected
- Verify **Authorization Code Grant** and **Public Client** are checked in NetSuite
- Ensure **all Token-based Authentication options are unchecked** in NetSuite
- Check for exact URL match (no trailing slashes, correct protocol http vs https)
- Verify the integration is in "Enabled" state

### MCP Tools Not Available

- Check server logs for MCP connection errors
- Ensure access token has proper permissions
- Try disconnecting and reconnecting

### Session Issues

- Clear browser cookies
- Check SESSION_SECRET is set
- Verify CORS configuration matches client URL

## 📝 Development Notes

### Adding New MCP Tools

1. Tools are auto-discovered from the MCP server
2. The LangChain agent automatically wraps them as `DynamicStructuredTool`
3. Update system prompts in `chat.js` if needed for tool-specific guidance

### Customizing UI

- Components are in `client/src/components/`
- Tailwind classes can be customized in `tailwind.config.js`
- Icons from `lucide-react` can be swapped as needed

## 🤝 Contributing

This is a POC/starter template. Feel free to:

- Fork and customize for your needs
- Add new features
- Improve error handling
- Enhance UI/UX
- Add tests

## 📄 License

MIT License - feel free to use this code for your projects.

## 🙏 Acknowledgments

- NetSuite for their robust API and OAuth implementation
- Model Context Protocol for standardized AI-tool integration
- LangChain for the excellent AI orchestration framework
- OpenAI, Anthropic, and Google for AI capabilities
- The open-source community for amazing tools and libraries

## 📞 Support

For issues or questions:

1. Check the troubleshooting section
2. Review NetSuite OAuth documentation
3. Check MCP server documentation
4. Open an issue in the repository

---

**Built with ❤️ for the NetSuite community**
