import React, { useState, useEffect, useRef } from "react";
import { Send, Settings, Moon, Sun, Trash2 } from "lucide-react";
import ConfigurationPanel from "./components/ConfigurationPanel";
import ConnectionStatus from "./components/ConnectionStatus";
import Message from "./components/Message";
import LoadingMessage from "./components/LoadingMessage";
import WelcomeMessage from "./components/WelcomeMessage";
import Notification from "./components/Notification";
import LockOpen from "./components/icons/LockOpen";

const OpenSuiteMCP = () => {
  // State management
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved ? JSON.parse(saved) : false;
  });
  const [netsuiteAuth, setNetsuiteAuth] = useState({ isAuthenticated: false });
  const [aiProvider, setAiProvider] = useState({ type: null, configured: false });
  const [availableTools, setAvailableTools] = useState([]);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [lastStatusCheck, setLastStatusCheck] = useState(null);
  const [notification, setNotification] = useState(null);
  const messagesEndRef = useRef(null);
  const statusCheckInterval = useRef(null);
  const inputRef = useRef(null);

  const showNotification = (type, message) => {
    setNotification({ type, message, id: Date.now() });
  };

  // Apply dark mode class to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("darkMode", JSON.stringify(darkMode));
  }, [darkMode]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Handle input change
  const handleInputChange = (e) => {
    setInput(e.target.value);
  };

  // Handle submit with streaming support
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!input?.trim() || isLoading) return;

    const userMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: input,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Focus back on input after a brief delay
    setTimeout(() => inputRef.current?.focus(), 100);

    try {
      const response = await fetch("http://localhost:3001/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: [...messages, userMessage],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle Server-Sent Events streaming
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let assistantMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: "",
        thinking: "", // Separate thinking/reasoning text
        thinkingSteps: [], // Detailed steps with queries and results
        createdAt: new Date(),
        toolCalls: [],
        currentToolCall: null, // Track current tool being executed
        isThinking: true, // Track if we're still in thinking phase
      };

      // Add placeholder message
      setMessages((prev) => [...prev, assistantMessage]);

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");

        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.substring(6));

              if (data.type === "text") {
                let textToAdd = data.content;

                // Smart spacing (but preserve newlines!)
                const currentText = assistantMessage.isThinking ? assistantMessage.thinking : assistantMessage.content;
                if (currentText.length > 0 && !textToAdd.startsWith("\n")) {
                  const lastChar = currentText.slice(-1);
                  const firstChar = textToAdd[0];
                  const needsSpace =
                    lastChar !== " " && lastChar !== "\n" && firstChar !== " " && firstChar !== "\n" && firstChar !== "." && firstChar !== "," && firstChar !== "!" && firstChar !== "?";

                  if (needsSpace && /[a-zA-Z]/.test(lastChar) && /[A-Z]/.test(firstChar)) {
                    textToAdd = " " + textToAdd;
                  }
                }

                // Before tool execution = thinking, after = final response
                if (assistantMessage.isThinking) {
                  assistantMessage.thinking += textToAdd;
                } else {
                  assistantMessage.content += textToAdd;
                }

                setMessages((prev) => prev.map((msg) => (msg.id === assistantMessage.id ? { ...assistantMessage } : msg)));
              } else if (data.type === "tool-call") {
                // Store current tool call with details
                assistantMessage.currentToolCall = {
                  name: data.toolName,
                  args: data.args,
                  status: "calling",
                };

                assistantMessage.toolCalls.push(assistantMessage.currentToolCall);
                setMessages((prev) => prev.map((msg) => (msg.id === assistantMessage.id ? { ...assistantMessage } : msg)));
              } else if (data.type === "tool-result") {
                if (assistantMessage.currentToolCall) {
                  assistantMessage.currentToolCall.status = "completed";
                  assistantMessage.currentToolCall.result = data.result;
                  assistantMessage.currentToolCall = null;
                }

                // DON'T switch to content yet - wait for final step
                setMessages((prev) => prev.map((msg) => (msg.id === assistantMessage.id ? { ...assistantMessage } : msg)));
              } else if (data.type === "step-finish") {
                console.log("📍 Step finished:", data.reason);
                // If this step finished with "stop", next text is final response
                if (data.reason === "stop") {
                  assistantMessage.isThinking = false;
                  setMessages((prev) => prev.map((msg) => (msg.id === assistantMessage.id ? { ...assistantMessage } : msg)));
                }
              } else if (data.type === "done") {
                console.log("✅ Streaming complete");
                assistantMessage.isThinking = false;
                setMessages((prev) => prev.map((msg) => (msg.id === assistantMessage.id ? { ...assistantMessage } : msg)));
              } else if (data.type === "error") {
                console.error("❌ Stream error:", data.error);
                assistantMessage.content = "Sorry, an error occurred: " + (data.error?.message || "Unknown error");
                assistantMessage.isThinking = false;
                assistantMessage.error = true;
                setMessages((prev) => prev.map((msg) => (msg.id === assistantMessage.id ? { ...assistantMessage } : msg)));
              }
            } catch (e) {
              console.error("Error parsing SSE:", e, line);
            }
          }
        }
      }

      console.log("Final message length:", assistantMessage.content.length);

      // Save conversation after streaming completes
      const finalMessages = [...messages, userMessage, assistantMessage];
      setMessages(finalMessages);

      await fetch("http://localhost:3001/api/chat/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: finalMessages }),
      }).catch((err) => console.error("Failed to save conversation:", err));
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now() + 1}`,
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          createdAt: new Date(),
          error: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load conversation history on mount
  useEffect(() => {
    const loadConversationHistory = async () => {
      try {
        const response = await fetch("http://localhost:3001/api/chat/history", {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            console.log(`Loaded ${data.messages.length} messages from session`);
            setMessages(data.messages);
            // Scroll to bottom after messages are loaded
            setTimeout(() => scrollToBottom(), 100);
          }
        }
      } catch (error) {
        console.error("Error loading conversation history:", error);
      }
    };

    loadConversationHistory();
  }, []); // Run once on mount

  // Check authentication status on mount and after OAuth callback
  useEffect(() => {
    // Check if we have a saved session
    checkAuthStatus();

    // Check URL params for OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("auth") === "success") {
      checkAuthStatus();
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get("error")) {
      console.error("Auth error:", urlParams.get("error"));
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Don't load from localStorage - rely on server status check
    // The server will tell us if AI is actually configured with a valid API key

    // Set up periodic status checks every 60 seconds
    statusCheckInterval.current = setInterval(() => {
      console.log("🔄 Periodic status check...");
      checkAuthStatus();
    }, 60000); // 60 seconds

    // Cleanup interval on unmount
    return () => {
      if (statusCheckInterval.current) {
        clearInterval(statusCheckInterval.current);
      }
    };
  }, []);

  const checkAuthStatus = async (retryCount = 0) => {
    try {
      // Check both NetSuite auth and AI provider status
      const [authResponse, providerResponse] = await Promise.all([
        fetch("http://localhost:3001/api/auth/status", {
          credentials: "include",
        }),
        fetch("http://localhost:3001/api/provider/status", {
          credentials: "include",
        }),
      ]);

      const authData = await authResponse.json();
      const providerData = await providerResponse.json();

      // Update last check timestamp
      setLastStatusCheck(new Date());

      setNetsuiteAuth({
        ...authData,
        lastChecked: new Date().toISOString(),
      });

      if (providerData.configured) {
        setAiProvider({
          type: providerData.type,
          model: providerData.model,
          configured: true,
          configuredAt: providerData.configuredAt,
        });
        console.log(`✅ AI Provider active: ${providerData.type} (${providerData.model})`);
      } else {
        // Clear AI provider if not configured on server
        setAiProvider({ type: null, configured: false });
        if (providerData.configured === false) {
          console.log("ℹ️ AI Provider not configured on server");
        }
      }

      if (authData.isAuthenticated) {
        console.log("✅ NetSuite session active");
        // Load available MCP tools
        await loadAvailableTools();
      } else {
        console.log("ℹ️ No active NetSuite session");
        setAvailableTools([]);
      }
    } catch (error) {
      console.error("Error checking auth status:", error);

      // Retry once if connection refused (server might be restarting)
      if (retryCount === 0 && error.message.includes("fetch")) {
        console.log("Server might be restarting, retrying in 2 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return checkAuthStatus(1);
      }

      setLastStatusCheck(new Date());
    } finally {
      setIsCheckingSession(false);
    }
  };

  const loadAvailableTools = async () => {
    try {
      const response = await fetch("http://localhost:3001/api/mcp/tools", {
        credentials: "include",
      });
      const data = await response.json();
      setAvailableTools(data.tools || []);
    } catch (error) {
      console.error("Error loading tools:", error);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleClearChat = async () => {
    if (!confirm("Are you sure you want to clear the conversation history?")) {
      return;
    }

    try {
      const response = await fetch("http://localhost:3001/api/chat/clear", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        setMessages([]);
        console.log("Conversation cleared");
      }
    } catch (error) {
      console.error("Error clearing conversation:", error);
    }
  };

  // Show loading while checking for existing session
  if (isCheckingSession) {
    return (
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 items-center justify-center">
        <LockOpen className="w-16 h-16 text-blue-600 dark:text-blue-400 mb-4 animate-pulse" />
        <p className="text-gray-600 dark:text-gray-400">Checking for existing session...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <LockOpen className="w-8 h-8 text-blue-600 dark:text-blue-500" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">OpenSuiteMCP</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Open Source NetSuite MCP Client</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <ConnectionStatus netsuiteAuth={netsuiteAuth} aiProvider={aiProvider} lastChecked={lastStatusCheck} onReconnect={() => setShowConfig(true)} />
            {messages.length > 0 && (
              <button onClick={handleClearChat} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Clear conversation">
                <Trash2 className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            )}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {darkMode ? <Sun className="w-5 h-5 text-gray-600 dark:text-gray-300" /> : <Moon className="w-5 h-5 text-gray-600" />}
            </button>
            <button onClick={() => setShowConfig(!showConfig)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Settings">
              <Settings className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>
      </div>

      {/* Configuration Modal */}
      {showConfig && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 z-40 transition-opacity" onClick={() => setShowConfig(false)} />

          {/* Notification Toast */}
          {notification && (
            <div className="fixed top-4 right-4 z-[60] max-w-md">
              <Notification type={notification.type} message={notification.message} onClose={() => setNotification(null)} autoClose={true} duration={4000} />
            </div>
          )}

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <ConfigurationPanel
                netsuiteAuth={netsuiteAuth}
                aiProvider={aiProvider}
                setAiProvider={setAiProvider}
                onAuthChange={checkAuthStatus}
                availableTools={availableTools}
                onClose={() => setShowConfig(false)}
                showNotification={showNotification}
              />
            </div>
          </div>
        </>
      )}

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide">
        {messages.length === 0 ? (
          <WelcomeMessage isConnected={netsuiteAuth.isAuthenticated} availableTools={availableTools} />
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {messages.map((message) => (
              <Message key={message.id} message={message} />
            ))}
            {isLoading && <LoadingMessage />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="relative flex items-center">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder={netsuiteAuth.isAuthenticated ? "Ask about NetSuite reports, searches, or data..." : "Connect to NetSuite first..."}
                className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none placeholder-gray-400 dark:placeholder-gray-500 overflow-hidden"
                rows="1"
                disabled={!netsuiteAuth.isAuthenticated}
                style={{ maxHeight: "120px" }}
              />
              <button
                type="submit"
                disabled={isLoading || !input?.trim() || !netsuiteAuth.isAuthenticated}
                className="absolute right-2 bottom-3.5 p-2 bg-blue-600 dark:bg-blue-500 text-white rounded-full hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </form>
          {!netsuiteAuth.isAuthenticated && <p className="mt-2 text-sm text-orange-600 dark:text-orange-400">⚠️ Connect to NetSuite in Settings to start</p>}
          {netsuiteAuth.isAuthenticated && !aiProvider.configured && <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">💡 Configure an AI provider in Settings to enable queries</p>}
        </div>
      </div>
    </div>
  );
};

export default OpenSuiteMCP;
