import React from "react";
import { Loader2 } from "lucide-react";
import LockOpen from "./icons/LockOpen";

const LoadingMessage = () => (
  <div className="flex justify-start">
    <div className="flex space-x-3 max-w-3xl">
      <div className="flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-gray-700 dark:bg-gray-600 flex items-center justify-center">
          <LockOpen className="w-6 h-6 text-white" />
        </div>
      </div>
      <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-3">
        <div className="flex items-center space-x-2">
          <Loader2 className="w-4 h-4 animate-spin text-gray-500 dark:text-gray-400" />
          <span className="text-gray-500 dark:text-gray-300">Processing with MCP tools...</span>
        </div>
      </div>
    </div>
  </div>
);

export default LoadingMessage;
