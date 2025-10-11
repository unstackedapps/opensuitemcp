import React from "react";

const SampleQuery = ({ icon, title, examples }) => (
  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
    <div className="flex items-center space-x-2 mb-3 text-gray-700 dark:text-gray-300">
      {icon}
      <h3 className="font-medium">{title}</h3>
    </div>
    <ul className="space-y-1">
      {examples.map((example, idx) => (
        <li key={idx} className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer">
          • {example}
        </li>
      ))}
    </ul>
  </div>
);

export default SampleQuery;
