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

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                            │
├─────────────────────────────────────────────────────────────────┤
│  React Frontend (Vite + Tailwind)                               │
│  ├─ Custom State Management                                     │
│  ├─ Real-time Streaming UI (SSE)                                │
│  └─ Configuration Management                                    │
└────────────────┬────────────────────────────────────────────────┘
                 │ HTTP + Server-Sent Events
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXPRESS.JS BACKEND                           │
├─────────────────────────────────────────────────────────────────┤
│  Session Management (File-based, Persistent)                    │
│  ├─ OAuth Tokens                                                │
│  ├─ AI API Keys                                                 │
│  └─ User Preferences & Conversation History                     │
│                                                                 │
│  LangChain Framework                                            │
│  ├─ Agent Executor - Multi-step reasoning                       │
│  ├─ Tool Execution - Type-safe with Zod                         │
│  ├─ Streaming Support - Real-time responses                     │
│  └─ Provider Abstraction (OpenAI/Anthropic/Google)              │
└────────────┬─────────────────────────┬──────────────────────────┘
             │                         │
             │                         │
             ▼                         ▼
┌──────────────────────┐   ┌─────────────────────────┐
│   NETSUITE MCP API   │   │  AI PROVIDER APIS       │
│   (OAuth 2.0/PKCE)   │   │  - OpenAI (GPT)         │
│                      │   │  - Anthropic (Claude)   │
│  - Tools Discovery   │   │  - Google (Gemini)      │
│  - Query Execution   │   │                         │
│  - JSON-RPC 2.0      │   │  Dynamic Model Selection│
└──────────────────────┘   └─────────────────────────┘
```

### Project Structure

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
- NetSuite account with:
  - Administrator access to create roles and OAuth integrations
  - A custom role with OAuth 2.0 and MCP permissions (see setup instructions)
  - A user assigned to this role
- **OpenAI API key, Anthropic API key, OR Google AI API key** (required for AI-first NLQ functionality)

## 🚀 Installation & Setup

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/devszilla/opensuitemcp.git
cd opensuitemcp

# Install backend dependencies
cd server
npm install

# Install frontend dependencies
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

### 2. Environment Setup

```bash
# Copy the example environment file
cd server
cp env.example .env
```

The default values in `.env` are ready for development. You only need to modify them for production deployment (see Production Deployment section below).

### 3. NetSuite Role Configuration (CRITICAL)

> **⚠️ IMPORTANT**: Before configuring OAuth, you must create a custom NetSuite role with the proper permissions. Without this role, the OAuth flow and MCP tools will not work.

#### Step 1: Create Custom Role

1. Log into NetSuite as an Administrator
2. Go to **Setup > Users/Roles > Manage Roles**
3. Click **New**
4. Configure the role:
   - **Name**: OpenSuiteMCP User Role (or your preferred name)
   - **Center Type**: Choose appropriate center for your users

#### Step 2: Assign Required Permissions (CRITICAL)

The role **MUST** have these three permissions for OAuth 2.0 and MCP to work:

1. **Log in using OAuth 2.0 Access Tokens**

   - Navigate to **Setup** tab in the role
   - Check **Log in using OAuth 2.0 Access Tokens**

2. **MCP Server Connection**

   - Navigate to **Setup** tab in the role
   - Check **MCP Server Connection**

3. **OAuth 2.0 Authorized Applications Management**
   - Navigate to **Setup** tab in the role
   - Check **OAuth 2.0 Authorized Applications Management**

#### Step 3: Configure MCP Tool Permissions

Depending on which MCP tools you want to use, assign these permissions:

**For Record Management Tools:**

- `ns_createRecord`, `ns_getRecord`, `ns_getRecordTypeMetadata`, `ns_updateRecord`
  - Navigate to **Permissions > Setup** tab
  - Add **REST Web Services** permission with **Full** access level

**For Report Tools:**

- `ns_listAllReports` and `ns_runReport`
  - No specific permissions required to see the tools
  - Data visibility depends on other role permissions (e.g., Customers - View, Transactions - View)

**For Saved Search Tools:**

- `ns_listSavedSearches` and `ns_runSavedSearch`
  - Navigate to **Permissions > Lists** tab
  - Add **Perform Search** permission
  - Add view permissions for record types in your searches (e.g., Customer - View, Transaction - View)

**For SuiteQL Tool:**

- `ns_runCustomSuiteQL`
  - Add view permissions for tables you want to query
  - Example: Customer - View, Vendor - View, Transaction - View

#### Step 4: Assign Role to User

1. Go to **Lists > Employees > Employees** (or **Setup > Users/Roles > Manage Users**)
2. Select the user who will use OpenSuiteMCP
3. Click **Edit**
4. In the **Access** tab, add your custom role to **Roles**
5. Click **Save**

> **💡 Security Best Practice**: Create a dedicated NetSuite user account for OpenSuiteMCP with only the permissions needed for your use case. Do not use an Administrator account.

### 4. NetSuite OAuth Configuration

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

### 5. No Additional MCP Setup Needed!

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
6. Log in to NetSuite
7. **Review the OAuth consent screen:**
   - You should see information about **BYO LLM (Bring Your Own LLM)**
   - Important warnings about AI usage and accuracy will be displayed
   - **If you don't see this information**, you're likely associated with the wrong role
   - Click **"Choose Another Role"** and select your **custom MCP role** (the one you created in Step 3 of setup)
8. Click **Authorize** to grant access
9. The popup will close and you'll be connected

> **💡 Tip**: If the OAuth consent screen doesn't show MCP-related information, it means your current role doesn't have MCP Server Connection permission. Make sure to select the correct role that has the three required permissions (OAuth 2.0 Access Tokens, MCP Server Connection, and OAuth 2.0 Authorized Applications Management).

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

With proper role configuration, the application provides access to **9 native NetSuite MCP tools**:

### Record Management Tools

1. **ns_createRecord**: Create new records in NetSuite

   - First call `ns_getRecordTypeMetadata` to understand the record structure
   - Then create the record with the appropriate data

2. **ns_updateRecord**: Update existing NetSuite records

   - First call `ns_getRecordTypeMetadata` to understand the record structure
   - Then update the record with new data

3. **ns_getRecord**: Retrieve a specific record from NetSuite

   - Specify record type, ID, and optional fields

4. **ns_getRecordTypeMetadata**: Get metadata about record types
   - Returns available fields and their types for any record type
   - Essential for creating/updating records

### Report Tools

5. **ns_listAllReports**: List all available reports

   - Returns report names, internal IDs, date formats, and period settings

6. **ns_runReport**: Run a NetSuite report
   - Execute reports and get column values from summary lines
   - Supports date ranges and fiscal periods

### Saved Search Tools

7. **ns_listSavedSearches**: List all saved searches

   - Optionally filter by name

8. **ns_runSavedSearch**: Execute a saved search
   - Run searches with optional range parameters

### SuiteQL Tool

9. **ns_runCustomSuiteQL**: Execute custom SuiteQL queries
   - Most flexible tool for querying NetSuite data
   - Limited to 5000 rows per query
   - Use WHERE clauses to filter if limit is reached

> **💡 Note**: Tool availability depends on your NetSuite role permissions. See the Role Configuration section for required permissions for each tool.

View available tools in the **MCP Tools** tab of the configuration panel.

## 🔐 Security Features

### OAuth 2.0 with PKCE

- **No stored credentials**: Tokens are session-based
- **PKCE flow**: Protection against authorization code interception
- **Secure sessions**: HTTP-only cookies with configurable expiration
- **Token refresh**: Automatic token renewal

### Session Management

**File-based sessions** provide:

- 7-day TTL (configurable)
- Persistent storage (survives server restarts)
- Secure file permissions
- Session contents include:
  - OAuth tokens (never sent to frontend)
  - AI provider configuration and API keys
  - Conversation history

**What's saved (localStorage):**

- ✅ NetSuite Account ID
- ✅ OAuth Client ID
- ✅ Scope preference
- ✅ AI Provider preference (type only, not API key)

**What's NOT saved (Security):**

- ❌ Access tokens (server-side session only)
- ❌ Refresh tokens (server-side session only)
- ❌ AI API keys (must re-enter after server restart)

### Production Considerations

- Use HTTPS in production
- Implement CSRF protection
- Add rate limiting
- Use Redis for session storage (horizontal scaling)
- Encrypt sensitive data at rest
- Add request logging and monitoring

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

## 📦 Technology Stack

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
- `openai` - OpenAI SDK (used for model listing)
- `@anthropic-ai/sdk` - Anthropic SDK (used for model listing)
- `@google/generative-ai` - Google AI SDK (used for model listing)

### Frontend

- `react` - UI framework
- `vite` - Build tool
- `tailwindcss` - Styling (with dark mode)
- `lucide-react` - Icons
- `react-markdown` - Markdown rendering
- `remark-gfm` - GitHub Flavored Markdown

## 🚦 Production Deployment

### Environment Variables

For production, update your `server/.env` file with these values:

```env
# Production
NODE_ENV=production
PORT=3001
SESSION_SECRET=your-secure-random-production-secret  # CHANGE THIS!

# URLs (update with your actual domains)
CLIENT_URL=https://your-domain.com
API_URL=https://api.your-domain.com
```

> **⚠️ Important**: Always generate a new, strong `SESSION_SECRET` for production. Never use the example value from `env.example`.

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

### Role Configuration Issues

**OAuth fails or MCP tools don't appear:**

- ✅ Verify the user's role has **Log in using OAuth 2.0 Access Tokens** permission
- ✅ Verify the user's role has **MCP Server Connection** permission
- ✅ Verify the user's role has **OAuth 2.0 Authorized Applications Management** permission
- ✅ Check that the role is assigned to the NetSuite user
- ✅ Log out of NetSuite and log back in after role changes

**Specific MCP tools missing:**

- For record tools (`ns_createRecord`, etc.): Check **REST Web Services** permission is set to **Full**
- For saved searches: Check **Perform Search** permission is enabled
- For SuiteQL queries: Check user has view permissions for the tables being queried

### OAuth Connection Issues

- Verify redirect URI matches NetSuite configuration exactly: `http://localhost:3001/api/auth/callback`
- Check that Account ID and Client ID are correct
- Ensure NetSuite integration has **NetSuite AI Connector Service** scope selected
- Verify **Authorization Code Grant** and **Public Client** are checked in NetSuite
- Ensure **all Token-based Authentication options are unchecked** in NetSuite
- Check for exact URL match (no trailing slashes, correct protocol http vs https)
- Verify the integration is in "Enabled" state
- **Verify the user has the custom role with required OAuth/MCP permissions** (see Role Configuration section)

### MCP Tools Not Available

- **Expected**: With proper role configuration, you should see **9 MCP tools** in the MCP Tools tab
- Check server logs for MCP connection errors
- Ensure access token has proper permissions
- **Verify the user's role has MCP Server Connection permission**
- **Check role permissions for specific tools** (see Role Configuration section)
- If you see fewer than 9 tools, check the specific permissions for missing tools
- Try disconnecting and reconnecting

### Session Issues

- Clear browser cookies
- Check SESSION_SECRET is set
- Verify CORS configuration matches client URL

### Installation Issues

**Backend won't start:**

1. Check Node version: `node --version` (should be 18+)
2. Check .env file exists with SESSION_SECRET
3. Check port 3001 is available
4. Look for errors in console

**Frontend won't start:**

1. Check Node version: `node --version` (should be 18+)
2. Check port 5173 is available
3. Clear Vite cache: `rm -rf node_modules/.vite`
4. Look for errors in console

**Dependencies won't install:**

1. Clear npm cache: `npm cache clean --force`
2. Delete node_modules and package-lock.json
3. Run `npm install` again
4. Check Node version compatibility

## 📝 Development Notes

### Adding New MCP Tools

1. Tools are auto-discovered from the MCP server
2. The LangChain agent automatically wraps them as `DynamicStructuredTool`
3. Update system prompts in `chat.js` if needed for tool-specific guidance

### Customizing UI

- Components are in `client/src/components/`
- Tailwind classes can be customized in `tailwind.config.js`
- Icons from `lucide-react` can be swapped as needed

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
4. Open an issue in the [GitHub repository](https://github.com/devszilla/opensuitemcp)

---

**Built with ❤️ for the NetSuite community**
