import React from "react";
import { Bot } from "lucide-react";

const LoadingMessage = () => (
  <div className="flex justify-start">
    <div className="flex space-x-3 max-w-3xl">
      <div className="flex-shrink-0 relative">
        <div className="w-10 h-10 rounded-full bg-gray-700 dark:bg-gray-600 flex items-center justify-center">
          <Bot className="w-6 h-6 text-white" />
        </div>
        {/* Spinning ring */}
        <div className="absolute -inset-0.5 rounded-full border-2 border-gray-400 dark:border-gray-500 border-t-blue-500 animate-spin"></div>
      </div>
      <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-3">
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500 dark:text-gray-300">Processing request with MCP tools...</span>
        </div>
      </div>
    </div>
  </div>
);

export default LoadingMessage;
