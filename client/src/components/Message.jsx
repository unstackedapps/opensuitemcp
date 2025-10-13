import React from "react";
import { User, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const Message = ({ message }) => {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-3xl ${isUser ? "flex-row-reverse" : "flex-row"} space-x-3`}>
        <div className={`flex-shrink-0 ${isUser ? "ml-3" : "mr-3"}`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isUser ? "bg-blue-600" : "bg-gray-700"}`}>
            {isUser ? <User className="w-6 h-6 text-white" /> : <Bot className="w-6 h-6 text-white" />}
          </div>
        </div>
        <div className="flex-1">
          <div className={`rounded-lg px-4 py-3 ${isUser ? "bg-blue-600 dark:bg-blue-500 text-white" : "bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600"}`}>
            {isUser ? (
              <p className="whitespace-pre-wrap text-white text-sm">{message.content}</p>
            ) : (
              <>
                {/* Integrated thinking with tool details */}
                {message.thinking && message.thinking.trim().length > 0 && <div className="mb-3 text-sm text-gray-600 dark:text-gray-400 italic">{message.thinking}</div>}

                {/* Tool execution details (always visible, not collapsed) */}
                {message.toolCalls?.length > 0 && (
                  <div className="space-y-3 mb-4">
                    {message.toolCalls.map((tc, idx) => (
                      <div key={idx} className="bg-gray-50 dark:bg-gray-800/50 border-l-2 border-blue-400 dark:border-blue-600 pl-3 py-2">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="font-semibold text-blue-600 dark:text-blue-400 text-sm">🔧 {tc.name}</span>
                          {tc.status === "completed" && <span className="text-green-600 dark:text-green-400 text-xs">✓ Complete</span>}
                          {tc.status === "calling" && <span className="text-yellow-600 dark:text-yellow-400 text-xs">⏳ Running...</span>}
                        </div>

                        {/* Show SQL query if available */}
                        {tc.args?.sqlQuery && (
                          <div className="mb-2">
                            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Query:</div>
                            <pre className="text-xs bg-white dark:bg-gray-900 p-2 rounded font-mono overflow-x-auto text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                              {tc.args.sqlQuery}
                            </pre>
                          </div>
                        )}

                        {/* Show other args */}
                        {tc.args && Object.keys(tc.args).filter((k) => k !== "sqlQuery").length > 0 && (
                          <div className="mb-2">
                            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Parameters:</div>
                            <div className="text-xs text-gray-700 dark:text-gray-300 font-mono bg-white dark:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-700">
                              {Object.entries(tc.args)
                                .filter(([k]) => k !== "sqlQuery")
                                .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                                .join(", ")}
                            </div>
                          </div>
                        )}

                        {/* Show result/error - collapsed by default */}
                        {tc.result && (
                          <div>
                            <div className="text-xs font-medium text-gray-600 dark:text-gray-400">{tc.result.error ? "❌ Error" : "✅ Query executed successfully"}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Final Response (only the answer, not thinking) */}
                <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-1">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <p className="mb-3">{children}</p>,
                      ul: ({ children }) => <ul className="mb-3 space-y-1">{children}</ul>,
                      strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>,
                    }}
                  >
                    {message.content || (message.isThinking ? "Thinking..." : "")}
                  </ReactMarkdown>
                </div>
              </>
            )}
          </div>
          <p className={`text-xs mt-1 ${isUser ? "text-right" : "text-left"} text-gray-500 dark:text-gray-400`}>
            {message.createdAt ? new Date(message.createdAt).toLocaleTimeString() : new Date().toLocaleTimeString()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Message;
