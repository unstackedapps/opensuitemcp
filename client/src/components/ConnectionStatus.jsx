import React from "react";
import { RefreshCw } from "lucide-react";

const ConnectionStatus = ({ netsuiteAuth, aiProvider, lastChecked, onReconnect }) => {
  const showError = netsuiteAuth.connectionError;
  const isConnected = netsuiteAuth.isAuthenticated && !showError;

  return (
    <div className="flex items-center space-x-6">
      <div className="flex flex-col">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${showError ? "bg-yellow-500 animate-pulse" : isConnected ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
          <span className={`text-sm ${showError ? "text-yellow-700 font-medium" : isConnected ? "text-green-700 font-medium" : "text-gray-600"}`}>
            NetSuite {showError ? "Connection Expired" : isConnected ? "Connected" : "Disconnected"}
          </span>
          {showError && onReconnect && (
            <button onClick={onReconnect} className="ml-2 p-1 text-yellow-600 hover:text-yellow-800 hover:bg-yellow-50 rounded transition-colors" title="Reconnect to NetSuite">
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
        {lastChecked && <span className="text-xs text-gray-400 ml-4">Last checked: {lastChecked.toLocaleTimeString()}</span>}
      </div>
      <div className="flex items-center space-x-2">
        <div className={`w-2 h-2 rounded-full ${aiProvider.configured ? "bg-blue-500 animate-pulse" : "bg-gray-400"}`} />
        <span className={`text-sm ${aiProvider.configured ? "text-blue-700 font-medium" : "text-gray-600"}`}>AI {aiProvider.configured ? aiProvider.model || aiProvider.type : "Not Configured"}</span>
      </div>
    </div>
  );
};

export default ConnectionStatus;
