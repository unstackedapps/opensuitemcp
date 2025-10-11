# Architecture Overview

## 🏗️ High-Level Architecture

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

---

## 📦 Component Architecture

### **Frontend (React + Vite)**

#### **Tech Stack:**

- **React 18** - UI framework
- **Vite 5** - Build tool & dev server
- **Tailwind CSS** - Styling with dark mode
- **lucide-react** - Icons
- **react-markdown** - Markdown rendering for AI responses

#### **Key Components:**

```
client/src/
├── App.jsx                      # Main app, custom state management
├── components/
│   ├── ConfigurationPanel.jsx  # OAuth + AI provider setup
│   ├── ConnectionStatus.jsx    # Real-time status indicators
│   ├── Message.jsx             # Chat message display
│   ├── LoadingMessage.jsx      # Loading state with "thinking" indicator
│   ├── WelcomeMessage.jsx      # Initial greeting
│   ├── SampleQuery.jsx         # Example query buttons
│   ├── MCPToolResults.jsx      # Tool execution results
│   ├── Modal.jsx               # Reusable modal component
│   └── Notification.jsx        # Toast notifications
└── main.jsx                    # React entry point
```

#### **State Management:**

- **Server-Driven State**: Auth status, AI config, MCP tools
- **Client State**: UI state (modals, loading, notifications), message input
- **Persistent State**: `localStorage` for Account ID, Client ID preferences
- **Custom Streaming**: Server-Sent Events (SSE) for real-time AI responses

---

### **Backend (Node.js + Express + LangChain)**

#### **Tech Stack:**

- **Express 4** - Web framework
- **LangChain (0.3.35)** - AI orchestration framework
- **@langchain/openai** - OpenAI provider
- **@langchain/anthropic** - Anthropic provider
- **@langchain/google-genai** - Google Gemini provider
- **Zod 3** - Schema validation
- **express-session + session-file-store** - Persistent sessions
- **axios** - HTTP client for NetSuite MCP API

#### **Directory Structure:**

```
server/src/
├── app.js                          # Express app initialization
├── middleware/
│   ├── session.js                  # Session config (file-based, 7-day TTL)
│   └── errorHandler.js             # Global error handling
├── routes/
│   ├── auth.js                     # OAuth flow (connect, callback, status, disconnect)
│   ├── chat.js                     # AI chat with streaming (uses LangChain)
│   ├── mcp.js                      # MCP tools listing
│   └── provider.js                 # AI provider config & model fetching
└── services/
    ├── netsuiteAuth.js             # OAuth 2.0 + PKCE logic
    ├── mcpService.js               # MCP JSON-RPC client
    └── aiService.js                # AI provider utilities (config, model listing)
```

---

## 🔄 Data Flow

### **1. OAuth Authentication Flow**

```
User → Frontend Config Panel
  ↓
Frontend: POST /api/auth/connect
  ↓
Backend: Generate PKCE challenge → Store in session
  ↓
Return authUrl to frontend
  ↓
Frontend: Open OAuth popup
  ↓
NetSuite: User authorizes
  ↓
NetSuite: Redirect to /api/auth/callback?code=XXX
  ↓
Backend: Exchange code for tokens using PKCE verifier
  ↓
Store tokens in session (file-based, persistent)
  ↓
Frontend: Poll /api/auth/status → Update UI
```

### **2. AI Provider Configuration Flow**

```
User → Enter API Key → Click "Authenticate & Fetch Models"
  ↓
Frontend: POST /api/provider/models { type, apiKey }
  ↓
Backend: Call OpenAI/Anthropic/Google API to list models
  ↓
Return models to frontend
  ↓
User → Select model → Click "Save Configuration"
  ↓
Frontend: POST /api/provider/configure { type, model, apiKey }
  ↓
Backend: Test API key with simple call
  ↓
Store { type, model, apiKey } in session
  ↓
Return success to frontend
```

### **3. Chat Message Flow (with LangChain Streaming)**

```
User → Type message → Press Send
  ↓
Frontend: POST /api/chat/message
         { messages: [...history, newMessage] }
  ↓
Backend: Check session for auth & AI config
  ↓
Fetch MCP tools from NetSuite
  ↓
Build Zod schemas for each tool
  ↓
Initialize LangChain model (ChatOpenAI/ChatAnthropic/ChatGoogleGenerativeAI)
  ↓
Wrap MCP tools as DynamicStructuredTool
  ↓
Create LangChain agent with createToolCallingAgent()
  ↓
Execute agent with AgentExecutor.stream():
  - model: LangChain chat model
  - messages: conversation history
  - tools: MCP tools as LangChain tools
  - prompt: System instructions + chat template
  ↓
AI decides to call tool (e.g., ns_runCustomSuiteQL)
  ↓
LangChain executes tool function
  ↓
Tool function → mcpService.executeTool()
  ↓
mcpService → POST to NetSuite MCP API (JSON-RPC 2.0)
  ↓
NetSuite → Execute SuiteQL → Return results
  ↓
Tool result flows back to AI agent
  ↓
AI formats response with results
  ↓
Backend: Stream response to frontend via SSE
  ↓
Frontend: Custom SSE parser receives streaming chunks
  ↓
UI updates in real-time with "thinking" state
  ↓
Final response displayed with formatted markdown
```

---

## 🔐 Security Architecture

### **Session Management**

```javascript
// File: server/src/middleware/session.js
- Storage: File-based (./sessions/ directory, gitignored)
- TTL: 7 days
- Cookie: httpOnly, sameSite: 'lax', secure in production
- Session ID: Random, stored in cookie 'netsuite.sid'
```

**Session Contents:**

```javascript
req.session = {
  id: "session-id-xxx",
  netsuiteTokens: {
    access_token: "xxx",
    refresh_token: "xxx",
    accountId: "xxx",
    clientId: "xxx",
    expiresAt: "ISO timestamp",
  },
  aiProvider: {
    type: "openai" | "anthropic" | "gemini",
    model: "gpt-4o",
    apiKey: "sk-xxx", // Encrypted at rest (file permissions)
    configured: true,
    configuredAt: "ISO timestamp",
  },
  conversationHistory: [
    // Array of messages
  ],
  isAuthenticated: true,
  pkce: {
    // Temporary, deleted after OAuth callback
    verifier: "xxx",
    config: { accountId, clientId, scope },
  },
};
```

### **Security Features**

1. **OAuth 2.0 with PKCE** - No client secret needed
2. **Session-based auth** - Tokens never sent to frontend
3. **API keys in session only** - Not in localStorage or frontend
4. **httpOnly cookies** - XSS protection
5. **CORS configured** - Only localhost:5173 allowed (configurable)
6. **File-based sessions** - Outside git, proper permissions
7. **No token exposure** - Frontend never sees raw tokens

---

## ⚡ LangChain Integration

### **Why LangChain?**

**Key Benefits:**

- **Agent Architecture**: Multi-step reasoning with tool execution
- **Provider Agnostic**: Easy switching between OpenAI, Anthropic, Google
- **Streaming Built-in**: Native streaming support for real-time responses
- **Type-safe Tools**: Zod schemas for runtime validation
- **Production Ready**: Battle-tested framework with active development

### **Backend Implementation**

```javascript
// File: server/src/routes/chat.js
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { z } from "zod";

// Initialize AI model based on provider
let model;
if (req.session.aiProvider.type === "openai") {
  model = new ChatOpenAI({
    modelName: req.session.aiProvider.model,
    apiKey: req.session.aiProvider.apiKey,
    streaming: true,
  });
} else if (req.session.aiProvider.type === "anthropic") {
  model = new ChatAnthropic({
    modelName: req.session.aiProvider.model,
    anthropicApiKey: req.session.aiProvider.apiKey,
    streaming: true,
  });
}

// Build type-safe tools from MCP tools
const tools = availableTools.map((mcpTool) => {
  const schemaProps = {};
  Object.entries(mcpTool.inputSchema.properties).forEach(([key, prop]) => {
    schemaProps[key] = z.string().describe(prop.description || key);
    if (!mcpTool.inputSchema.required?.includes(key)) {
      schemaProps[key] = schemaProps[key].optional();
    }
  });

  return new DynamicStructuredTool({
    name: mcpTool.name,
    description: mcpTool.description,
    schema: z.object(schemaProps),
    func: async (params) => {
      return await mcpService.executeTool(userId, mcpTool.name, params);
    },
  });
});

// Create agent with tools
const agent = await createToolCallingAgent({
  llm: model,
  tools,
  prompt: ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    ["placeholder", "{chat_history}"],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]),
});

// Execute agent with streaming
const agentExecutor = new AgentExecutor({ agent, tools });
const stream = await agentExecutor.stream({
  input: lastUserMessage.content,
  chat_history: previousMessages,
});

// Stream to client via SSE
for await (const chunk of stream) {
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}
```

### **Frontend Implementation**

```javascript
// File: client/src/App.jsx
// Custom SSE handling
const sendMessage = async () => {
  const response = await fetch("http://localhost:3001/api/chat/message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ messages }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));
        if (data.type === "text") {
          // Update message content in real-time
        } else if (data.type === "done") {
          // Finish loading state
        }
      }
    }
  }
};
```

---

## 🔧 NetSuite MCP Integration

### **Direct REST API Approach**

We use NetSuite's **native MCP REST API** (no local server needed):

```javascript
// File: server/src/services/mcpService.js
const MCP_ENDPOINT = `https://${accountId}.suitetalk.api.netsuite.com/services/mcp/v1/all`;

// List tools
async fetchToolsList(userId) {
  const response = await axios.post(MCP_ENDPOINT, {
    jsonrpc: '2.0',
    method: 'tools/list',
    id: 'list-tools'
  }, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  return response.data.result.tools;
}

// Execute tool
async executeTool(userId, toolName, args) {
  const response = await axios.post(MCP_ENDPOINT, {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args
    },
    id: `tool-${Date.now()}`
  }, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  return response.data.result;
}
```

### **Available MCP Tools**

From NetSuite (auto-discovered):

- `ns_runCustomSuiteQL` - Execute SuiteQL queries
- `ns_listAllReports` - List financial reports
- `ns_runReport` - Execute reports
- `ns_listSavedSearches` - List saved searches
- `ns_runSavedSearch` - Execute saved searches
- And more...

---

## 🎯 Key Design Decisions

### **1. File-Based Sessions (Not Redis)**

**Why?** POC simplicity, works great for single-server, automatic persistence
**Trade-off:** Doesn't scale horizontally (fine for POC/small deployments)

### **2. Direct MCP API (Not Local Server)**

**Why?** Simpler, no child process management, same auth as Postman
**Trade-off:** None - this is the recommended approach

### **3. LangChain (Not Custom Implementation)**

**Why?** Production-ready, agent architecture, multi-provider support
**Trade-off:** Slightly larger dependency footprint (but worth it)

### **4. Session-Stored API Keys (Not Environment Variables)**

**Why?** Per-user configuration, dynamic model switching, persistence
**Trade-off:** Must secure session files (already done)

### **5. Custom SSE Frontend (Not useChat Hook)**

**Why?** Simpler, no version conflicts, full control over streaming
**Trade-off:** Manual state management (but straightforward)

### **6. AI-First Architecture (No Regex)**

**Why?** AI handles tool selection, SQL generation, error recovery
**Trade-off:** Requires AI provider (but that's the point)

---

## 📊 Technology Stack Summary

| Layer        | Technology                | Version | Purpose                    |
| ------------ | ------------------------- | ------- | -------------------------- |
| **Frontend** |
| Framework    | React                     | 18.2.0  | UI rendering               |
| Build Tool   | Vite                      | 5.0.0   | Dev server & bundling      |
| Styling      | Tailwind CSS              | 3.3.5   | Utility-first CSS          |
| Icons        | lucide-react              | 0.294.0 | Icon library               |
| Markdown     | react-markdown            | 10.1.0  | Markdown rendering         |
| **Backend**  |
| Runtime      | Node.js                   | 18+     | JavaScript runtime         |
| Framework    | Express                   | 4.18.2  | Web server                 |
| AI Core      | langchain                 | 0.3.35  | LangChain core framework   |
| AI Providers | @langchain/openai         | 0.6.14  | OpenAI integration         |
|              | @langchain/anthropic      | 0.3.30  | Anthropic integration      |
|              | @langchain/google-genai   | 0.2.18  | Google Gemini integration  |
|              | @langchain/core           | 0.3.78  | LangChain utilities        |
| Validation   | Zod                       | 3.25.76 | Schema validation          |
| Sessions     | express-session           | 1.17.3  | Session middleware         |
|              | session-file-store        | 1.5.0   | File-based session storage |
| HTTP Client  | axios                     | 1.6.2   | NetSuite API calls         |
| MCP SDK      | @modelcontextprotocol/sdk | 0.5.0   | Type definitions           |
| AI SDKs      | openai                    | 4.20.0  | OpenAI model listing       |
|              | @anthropic-ai/sdk         | 0.16.0  | Anthropic model listing    |
|              | @google/generative-ai     | 0.24.1  | Google AI model listing    |

---

## 🚀 Performance Characteristics

| Metric              | Value        | Notes                        |
| ------------------- | ------------ | ---------------------------- |
| **Frontend**        |
| Bundle Size         | ~500KB       | Vite tree-shaking            |
| Initial Load        | <1s          | Local dev                    |
| Hot Reload          | <100ms       | Vite HMR                     |
| **Backend**         |
| Startup Time        | ~500ms       | Express + middleware         |
| Session Load        | <10ms        | File I/O                     |
| MCP Tool List       | ~200ms       | NetSuite API                 |
| MCP Tool Call       | ~500ms       | Query complexity dependent   |
| **AI Streaming**    |
| Time to First Token | <500ms       | Model dependent              |
| Streaming Rate      | ~20 tokens/s | Model dependent              |
| Agent Execution     | Variable     | Depends on tool calls needed |

---

## 🔮 Future Enhancements

### **Planned Improvements:**

1. **Redis Sessions** - For horizontal scaling
2. **Rate Limiting** - Protect APIs
3. **Webhook Support** - Real-time NetSuite updates
4. **RAG Integration** - Query NetSuite documentation
5. **Multi-step Workflows** - Complex agent chains
6. **Conversation Export** - Save chat history
7. **Error Boundaries** - Better React error handling
8. **Caching** - Cache tool lists, model lists
9. **Analytics** - Track usage, performance
10. **Tests** - Unit and integration tests

### **Production Readiness:**

- [ ] Environment-specific configs
- [ ] HTTPS enforcement
- [ ] Rate limiting per user
- [ ] Database for audit logs
- [ ] Monitoring & alerting
- [ ] Docker containerization
- [ ] CI/CD pipeline
- [ ] Load balancing
- [ ] Backup strategy
- [ ] Security audit

---

## 📝 Architecture Principles

1. **Security First** - OAuth, session-based auth, no token exposure
2. **Simplicity** - Use frameworks over custom code
3. **Type Safety** - Zod schemas for runtime validation
4. **Persistence** - File-based sessions survive restarts
5. **Modularity** - Clear separation of concerns
6. **Streaming** - Real-time feedback to users
7. **AI-First** - Let AI make decisions
8. **Direct APIs** - No unnecessary abstractions
9. **Developer Experience** - Hot reload, clear logs
10. **Production-Ready Foundations** - Easy to scale later

---

**Last Updated:** October 11, 2025  
**Architecture Version:** 3.0 (LangChain Implementation)
