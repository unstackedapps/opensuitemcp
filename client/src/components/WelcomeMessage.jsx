import React from "react";
import { FileText, Search, Database, Code, ExternalLink } from "lucide-react";
import LockOpen from "./icons/LockOpen";
import SampleQuery from "./SampleQuery";

const WelcomeMessage = ({ isConnected, availableTools }) => (
  <div className="max-w-4xl mx-auto py-12">
    <div className="text-center mb-8">
      <LockOpen className="w-16 h-16 text-blue-600 dark:text-blue-500 mx-auto mb-4" />
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Welcome to OpenSuiteMCP</h2>
      <p className="text-gray-600 dark:text-gray-400">Open source AI assistant powered by NetSuite's Model Context Protocol</p>
    </div>

    {isConnected ? (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SampleQuery
            icon={<FileText className="w-5 h-5" />}
            title="Reports"
            examples={["List all available reports", "Run sales report for last quarter", "Show financial summary for this month"]}
          />
          <SampleQuery icon={<Search className="w-5 h-5" />} title="Saved Searches" examples={["Show my saved searches", "Run customer search", "Execute inventory saved search"]} />
          <SampleQuery icon={<Database className="w-5 h-5" />} title="Data Analysis" examples={["Total sales for last 30 days", "Compare this month vs last month", "Top customers by revenue"]} />
          <SampleQuery icon={<Code className="w-5 h-5" />} title="SuiteQL" examples={["Run SuiteQL for transaction data", "Query customer records", "SELECT * FROM transaction WHERE..."]} />
        </div>

        {availableTools.length > 0 && <div className="mt-6 text-sm text-gray-600 text-center">{availableTools.length} MCP tools available</div>}
      </>
    ) : (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
        <div className="flex items-start space-x-3">
          <ExternalLink className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-amber-900 mb-2">Get Started</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-amber-800">
              <li>Click the settings icon in the header</li>
              <li>Enter your NetSuite Account ID and OAuth 2.0 Client ID</li>
              <li>Click "Connect with OAuth 2.0"</li>
              <li>Authorize the application in NetSuite</li>
              <li>Start using MCP tools to query your data!</li>
            </ol>
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-500">Uses secure OAuth 2.0 with PKCE authentication</p>
          </div>
        </div>
      </div>
    )}
  </div>
);

export default WelcomeMessage;
