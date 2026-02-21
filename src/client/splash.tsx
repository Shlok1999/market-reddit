import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

export const Splash = () => {
  return (
    <div className="flex relative flex-col justify-center items-center min-h-screen gap-6 bg-gray-50 dark:bg-gray-900 font-sans p-6 text-center">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl max-w-sm w-full">
        <div className="mb-6 flex justify-center">
          <span className="text-6xl">🚀</span>
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-2">
          Reddit Marketing Agent
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mb-8">
          Analyze your product, find relevant subreddits, and generate engagement content in seconds.
        </p>

        <button
          className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
          onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
        >
          Start Analysis
        </button>
      </div>

      <footer className="text-xs text-gray-500 dark:text-gray-400 mt-8">
        Powered by Devvit
      </footer>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
