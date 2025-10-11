import React, { useState } from "react";
import { Loader2, Link, CheckCircle, XCircle, Database, X, ChevronDown, ChevronUp } from "lucide-react";

const ConfigurationPanel = ({ netsuiteAuth, aiProvider, setAiProvider, onAuthChange, availableTools, onClose, showNotification }) => {
  const [activeTab, setActiveTab] = useState("netsuite");
  const [netsuiteConfig, setNetsuiteConfig] = useState(() => {
    // Load saved config from localStorage
    const saved = localStorage.getItem("netsuiteConfig");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Error loading saved config:", e);
      }
    }
    return {
      accountId: "",
      clientId: "",
      scope: "mcp",
    };
  });
  const [aiConfig, setAiConfig] = useState(() => {
    // Load saved provider type from localStorage (just for convenience)
    const savedType = localStorage.getItem("aiProviderType");

    // Load saved API keys for all providers
    const savedApiKeys = {
      openai: localStorage.getItem("aiApiKey_openai") || "",
      anthropic: localStorage.getItem("aiApiKey_anthropic") || "",
      gemini: localStorage.getItem("aiApiKey_gemini") || "",
    };

    return {
      type: savedType || "openai",
      model: "", // Will be set after fetching models
      apiKey: savedApiKeys[savedType || "openai"], // Pre-fill with saved key
      savedApiKeys, // Store all saved keys
    };
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConfiguringAI, setIsConfiguringAI] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [expandedTools, setExpandedTools] = useState({});

  const handleNetSuiteConnect = async () => {
    if (!netsuiteConfig.accountId || !netsuiteConfig.clientId) {
      showNotification("warning", "Account ID and Client ID are required");
      return;
    }

    setIsConnecting(true);

    try {
      const response = await fetch("http://localhost:3001/api/auth/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(netsuiteConfig),
      });

      const data = await response.json();

      if (data.authUrl) {
        // Open OAuth authorization in new window with proper dimensions for NetSuite consent screen
        const width = 1000;
        const height = 900;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const authWindow = window.open(data.authUrl, "NetSuite OAuth", `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`);

        // Listen for messages from the popup
        const handleMessage = (event) => {
          // Verify origin for security
          if (event.origin !== window.location.origin && !event.origin.includes("localhost")) {
            return;
          }

          if (event.data.type === "oauth_success") {
            console.log("OAuth successful!");

            // Save config to localStorage for persistence
            localStorage.setItem(
              "netsuiteConfig",
              JSON.stringify({
                accountId: netsuiteConfig.accountId,
                clientId: netsuiteConfig.clientId,
                scope: netsuiteConfig.scope,
              })
            );

            // Wait a moment for server to be ready before checking status
            setTimeout(() => {
              setIsConnecting(false);
              onAuthChange();
            }, 1500);

            window.removeEventListener("message", handleMessage);
          } else if (event.data.type === "oauth_error") {
            console.error("OAuth error:", event.data.error);
            showNotification("error", `OAuth failed: ${event.data.error}`);
            setIsConnecting(false);
            window.removeEventListener("message", handleMessage);
          }
        };

        window.addEventListener("message", handleMessage);

        // Fallback: Check if window closed (in case postMessage fails)
        const checkInterval = setInterval(() => {
          if (authWindow.closed) {
            clearInterval(checkInterval);
            setIsConnecting(false);
            onAuthChange();
            window.removeEventListener("message", handleMessage);
          }
        }, 1000);
      }
    } catch (error) {
      console.error("Error initiating OAuth:", error);
      showNotification("error", "Failed to initiate OAuth flow");
      setIsConnecting(false);
    }
  };

  const handleNetSuiteDisconnect = async () => {
    try {
      await fetch("http://localhost:3001/api/auth/disconnect", {
        method: "POST",
        credentials: "include",
      });

      // Clear saved config from localStorage
      localStorage.removeItem("netsuiteConfig");

      // Reset form
      setNetsuiteConfig({
        accountId: "",
        clientId: "",
        scope: "mcp",
      });

      // Close the modal first
      onClose();

      // Call onAuthChange after a delay to let backend fully disconnect
      setTimeout(() => {
        onAuthChange();
      }, 500);
    } catch (error) {
      console.error("Error disconnecting:", error);
    }
  };

  const handleFetchModels = async () => {
    if (!aiConfig.apiKey) {
      showNotification("warning", "Please enter an API key first");
      return;
    }

    setIsFetchingModels(true);

    try {
      const response = await fetch("http://localhost:3001/api/provider/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: aiConfig.type,
          apiKey: aiConfig.apiKey,
        }),
      });

      const data = await response.json();

      if (response.ok && data.models) {
        setAvailableModels(data.models);

        // Auto-select current model if already configured, otherwise first model
        if (aiProvider.configured && aiProvider.model && aiProvider.type === aiConfig.type) {
          setAiConfig({ ...aiConfig, model: aiProvider.model });
        } else if (data.models.length > 0 && !aiConfig.model) {
          setAiConfig({ ...aiConfig, model: data.models[0].id });
        }

        // Success notification
        showNotification("success", `Found ${data.models.length} available models for ${aiConfig.type}`);
      } else {
        showNotification("error", data.error || "Failed to fetch models. Please check your API key.");
      }
    } catch (error) {
      console.error("Error fetching models:", error);
      showNotification("error", "Failed to fetch models. Please check your network connection.");
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleAIProviderSave = async () => {
    if (!aiConfig.apiKey) {
      showNotification("warning", "Please enter an API key");
      return;
    }

    if (!aiConfig.model) {
      showNotification("warning", "Please fetch models and select one first");
      return;
    }

    setIsConfiguringAI(true);

    try {
      const response = await fetch("http://localhost:3001/api/provider/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(aiConfig),
      });

      const data = await response.json();

      if (response.ok) {
        // Save AI provider preference to localStorage
        localStorage.setItem("aiProviderType", aiConfig.type);
        localStorage.setItem("aiProviderModel", aiConfig.model);

        // Save API key to localStorage for quick switching between providers
        // Note: localStorage is not encrypted, but convenient for dev tools
        if (aiConfig.apiKey) {
          localStorage.setItem(`aiApiKey_${aiConfig.type}`, aiConfig.apiKey);
        }

        setAiProvider({
          type: aiConfig.type,
          model: aiConfig.model,
          configured: true,
          configuredAt: new Date().toISOString(),
        });

        // Keep API key visible so user knows it's saved
        // Clear models for re-fetching if needed
        setAvailableModels([]);

        const providerName = aiConfig.type === "openai" ? "OpenAI" : aiConfig.type === "anthropic" ? "Anthropic" : "Google Gemini";
        showNotification("success", `${providerName} activated with ${aiConfig.model}!`);
      } else {
        showNotification("error", data.error || "Failed to configure AI provider. Please check your API key.");
      }
    } catch (error) {
      console.error("Error configuring AI provider:", error);
      showNotification("error", "Failed to configure AI provider. Please check your network connection.");
    } finally {
      setIsConfiguringAI(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 px-6 py-4">
      <div className="max-w-4xl mx-auto min-h-[500px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Configuration</h3>
          <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-4 border-b border-gray-200 dark:border-gray-700 mb-4">
          <button
            onClick={() => setActiveTab("netsuite")}
            className={`pb-2 px-1 border-b-2 transition-colors ${
              activeTab === "netsuite"
                ? "border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-500"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            NetSuite Connection
          </button>
          <button
            onClick={() => setActiveTab("ai")}
            className={`pb-2 px-1 border-b-2 transition-colors ${
              activeTab === "ai"
                ? "border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-500"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            AI Provider
          </button>
          <button
            onClick={() => setActiveTab("tools")}
            className={`pb-2 px-1 border-b-2 transition-colors ${
              activeTab === "tools"
                ? "border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-500"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            MCP Tools
          </button>
        </div>

        {/* NetSuite Tab */}
        {activeTab === "netsuite" && (
          <div className="space-y-4">
            {netsuiteAuth.isAuthenticated ? (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-green-900 font-medium">Connected to NetSuite</span>
                  </div>
                  <button onClick={handleNetSuiteDisconnect} className="px-3 py-1 text-sm border border-red-300 text-red-700 rounded hover:bg-red-50">
                    Disconnect
                  </button>
                </div>
                {netsuiteAuth.accountId && <p className="mt-2 text-sm text-green-700">Account ID: {netsuiteAuth.accountId}</p>}
              </div>
            ) : (
              <>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
                  <p className="text-sm text-blue-900 dark:text-blue-300">
                    <strong>Secure OAuth 2.0 with PKCE:</strong> No client secret needed - PKCE provides security through cryptographic proof of the authorization request.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">NetSuite Account ID</label>
                  <input
                    type="text"
                    value={netsuiteConfig.accountId}
                    onChange={(e) => setNetsuiteConfig({ ...netsuiteConfig, accountId: e.target.value })}
                    placeholder="e.g., 1234567"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Found in your NetSuite URL (e.g., 1234567.app.netsuite.com)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">OAuth 2.0 Client ID</label>
                  <input
                    type="password"
                    value={netsuiteConfig.clientId}
                    onChange={(e) => setNetsuiteConfig({ ...netsuiteConfig, clientId: e.target.value })}
                    placeholder="Your OAuth 2.0 Client ID"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">🔒 Client ID is masked for security</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Scope</label>
                  <input
                    type="text"
                    value={netsuiteConfig.scope}
                    onChange={(e) => setNetsuiteConfig({ ...netsuiteConfig, scope: e.target.value })}
                    placeholder="mcp"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">This corresponds to "NetSuite AI Connector Service" in NetSuite</p>
                </div>

                <button
                  onClick={handleNetSuiteConnect}
                  disabled={isConnecting || !netsuiteConfig.accountId || !netsuiteConfig.clientId}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <Link className="w-4 h-4" />
                      <span>Connect with OAuth 2.0</span>
                    </>
                  )}
                </button>

                <div className="text-sm text-gray-600">
                  <p className="font-medium mb-1">Setup Instructions:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Create an OAuth 2.0 integration in NetSuite (Public Client with PKCE)</li>
                    <li>Add http://localhost:3001/api/auth/callback as redirect URI</li>
                    <li>Select "NetSuite AI Connector Service" scope</li>
                    <li>Enter your Account ID and Client ID above</li>
                  </ol>
                </div>
              </>
            )}
          </div>
        )}

        {/* AI Provider Tab */}
        {activeTab === "ai" && (
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
              <p className="text-sm text-amber-900 dark:text-amber-300">
                <strong>Optional:</strong> Configure an AI provider for intelligent responses. The app works without AI but provides better analysis with it.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">AI Provider</label>
              <select
                value={aiConfig.type}
                onChange={(e) => {
                  const newType = e.target.value;
                  // Load saved API key for the new provider
                  const savedApiKey = localStorage.getItem(`aiApiKey_${newType}`) || "";

                  // Reset models when changing provider, but keep saved API key
                  setAiConfig({
                    ...aiConfig,
                    type: newType,
                    model: "",
                    apiKey: savedApiKey,
                  });
                  setAvailableModels([]);
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">API Key</label>
              <input
                type="password"
                value={aiConfig.apiKey}
                onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
                placeholder={aiConfig.apiKey ? "•••• API key saved" : "Enter your API key"}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              />
              {aiConfig.apiKey && <p className="mt-1 text-xs text-green-600 dark:text-green-400">✓ API key saved in browser - you can switch providers anytime</p>}
              {!aiConfig.apiKey && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">API keys are stored locally for quick switching between providers</p>}
            </div>

            <button
              onClick={handleFetchModels}
              disabled={!aiConfig.apiKey || isFetchingModels}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isFetchingModels ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Fetching Available Models...</span>
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  <span>Fetch Available Models</span>
                </>
              )}
            </button>

            {availableModels.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Model</label>
                <select
                  value={aiConfig.model}
                  onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                >
                  <option value="">-- Select a model --</option>
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {availableModels.length} model{availableModels.length !== 1 ? "s" : ""} available for your API key
                </p>
              </div>
            )}

            <button
              onClick={handleAIProviderSave}
              disabled={!aiConfig.apiKey || !aiConfig.model || isConfiguringAI}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isConfiguringAI ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Configuration...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Activate This Provider</span>
                </>
              )}
            </button>

            {aiProvider.configured && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-900 font-medium">
                      {aiProvider.type === "openai" ? "OpenAI" : aiProvider.type === "anthropic" ? "Anthropic" : "Google Gemini"} ({aiProvider.model || "configured"}) is active
                    </span>
                  </div>
                  {aiProvider.configuredAt && <span className="text-xs text-green-600">Connected {new Date(aiProvider.configuredAt).toLocaleString()}</span>}
                </div>
                <p className="mt-2 text-xs text-green-700">✅ Natural language queries enabled - AI will handle tool selection and SQL generation</p>
              </div>
            )}
          </div>
        )}

        {/* MCP Tools Tab */}
        {activeTab === "tools" && (
          <div className="space-y-4">
            {netsuiteAuth.isAuthenticated ? (
              <>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
                  <p className="text-sm text-blue-900 dark:text-blue-300">
                    {availableTools.length} MCP tool{availableTools.length !== 1 ? "s" : ""} available through your NetSuite connection
                  </p>
                </div>

                <div className="space-y-3">
                  {availableTools.length > 0 ? (
                    availableTools.map((tool, idx) => {
                      const isExpanded = expandedTools[idx];
                      const shouldTruncate = tool.description.length > 150;

                      return (
                        <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-700/50">
                          <div className="flex items-start space-x-3">
                            <Database className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between">
                                <h4 className="font-semibold text-gray-900 dark:text-white text-base">{tool.name}</h4>
                                {shouldTruncate && (
                                  <button
                                    onClick={() => setExpandedTools({ ...expandedTools, [idx]: !isExpanded })}
                                    className="ml-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex-shrink-0"
                                  >
                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                  </button>
                                )}
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{isExpanded || !shouldTruncate ? tool.description : tool.description.substring(0, 150) + "..."}</p>
                              {tool.inputSchema?.properties && Object.keys(tool.inputSchema.properties).length > 0 && (
                                <div className="mt-3">
                                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Parameters:</p>
                                  <div className="flex flex-wrap gap-2">
                                    {Object.entries(tool.inputSchema.properties).map(([key, prop]) => (
                                      <span
                                        key={key}
                                        className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
                                      >
                                        {key}
                                        <span className="ml-1 text-gray-500">({prop.type})</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-400">No tools available. MCP tools will appear once connected.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center">
                <Database className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                <p className="text-gray-600 dark:text-gray-400">Connect to NetSuite first to see available MCP tools</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfigurationPanel;
