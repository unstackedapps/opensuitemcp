import React from "react";
import { CheckCircle, XCircle } from "lucide-react";

const MCPToolResults = ({ results }) => {
  if (!results || (!results.results?.length && !results.errors?.length)) return null;

  return (
    <div className="mt-3 pt-3 border-t border-gray-300 space-y-2">
      <div className="text-sm font-medium text-gray-700">MCP Tool Execution:</div>
      {results.results?.map((result, idx) => (
        <div key={idx} className="text-sm bg-green-50 rounded p-2 border border-green-200">
          <div className="flex items-center space-x-2 text-green-800 font-medium">
            <CheckCircle className="w-4 h-4" />
            <span>{result.tool}</span>
          </div>
          {result.data && <div className="mt-1 text-xs text-green-700 font-mono">{typeof result.data === "object" ? JSON.stringify(result.data, null, 2) : result.data}</div>}
        </div>
      ))}
      {results.errors?.map((error, idx) => (
        <div key={idx} className="text-sm bg-red-50 rounded p-2 border border-red-200">
          <div className="flex items-center space-x-2 text-red-800 font-medium">
            <XCircle className="w-4 h-4" />
            <span>{error.tool} failed</span>
          </div>
          <p className="mt-1 text-xs text-red-600">{error.error}</p>
        </div>
      ))}
    </div>
  );
};

export default MCPToolResults;
