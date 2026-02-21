import './index.css';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnalysisRequest, AnalysisResult, AnalysisResponse } from '../shared/api';

export const App = () => {
  const [formData, setFormData] = useState<AnalysisRequest>({
    companyName: '',
    description: '',
    websiteUrl: '',
  });
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const GEMINI_API_KEY = 'AIzaSyA-gNUEylPTzemIPdCAcX7itTLSJYGMEhM';
  const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

  const scrapeWebsite = async (url: string): Promise<string> => {
    if (!url) return '';
    try {
      // Use a CORS proxy to fetch the website from the browser
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return '';
      const html = await response.text();
      // Use the browser's built-in DOM parser to extract visible text
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      // Remove non-content elements
      doc.querySelectorAll('script, style, nav, footer, noscript').forEach(el => el.remove());
      const text = doc.body?.innerText || '';
      return text.replace(/\s+/g, ' ').trim().substring(0, 6000);
    } catch (e) {
      console.warn('Could not scrape website:', e);
      return '';
    }
  };

  const callGemini = async (
    companyName: string,
    description: string,
    websiteUrl: string,
    websiteContent: string
  ): Promise<{ subreddits: string[]; keywords: string[] }> => {
    try {
      const siteContext = websiteContent
        ? `\nWebsite content:\n${websiteContent.substring(0, 3000)}`
        : '';

      const prompt = `
        You are a Reddit marketing expert. Analyze this company/product:
        Company: "${companyName}"
        Description: "${description}"
        Website: ${websiteUrl}${siteContext}

        Return a JSON object with two arrays:
        1. "subreddits": 12 relevant subreddit names (no r/ prefix) - be SPECIFIC to the niche
        2. "keywords": 10 search keywords relevant to the product for finding discussions

        Example for a cloud gaming service:
        {
          "subreddits": ["cloudgaming", "GeForceNow", "ShadowPC", "pcgaming", "xboxcloudgaming"],
          "keywords": ["cloud gaming", "game streaming", "remote gaming", "GeForce Now"]
        }

        Return ONLY the JSON object, no markdown, no extra text.
      `;

      const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });

      if (!response.ok) {
        console.warn('Gemini API error:', response.status);
        return { subreddits: [], keywords: [] };
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(clean);
      return {
        subreddits: Array.isArray(parsed.subreddits) ? parsed.subreddits.map((s: string) => s.trim()) : [],
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map((k: string) => k.trim()) : [],
      };
    } catch (e) {
      console.warn('Error calling Gemini:', e);
      return { subreddits: [], keywords: [] };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // 1. Scrape website from browser (bypasses Devvit HTTP restrictions)
      const websiteContent = await scrapeWebsite(formData.websiteUrl || '');

      // 2. Call Gemini from browser with full context
      const { subreddits: suggestedSubreddits, keywords: suggestedKeywords } = await callGemini(
        formData.companyName,
        formData.description,
        formData.websiteUrl || '',
        websiteContent
      );

      // 3. Send to server with Gemini suggestions
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, suggestedSubreddits, suggestedKeywords }),
      });

      const data: AnalysisResponse = await response.json();

      if (data.success && data.data) {
        setResult(data.data);
      } else {
        setError(data.error || 'Failed to analyze');
      }
    } catch (err) {
      console.error('Error submitting form:', err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8 font-sans text-gray-900 dark:text-gray-100">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white mb-2">
            Reddit Marketing Agent
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Find your audience and craft your message.
          </p>
        </header>

        <div className="bg-white dark:bg-gray-800 shadow-xl rounded-2xl overflow-hidden p-8 mb-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Company Name
              </label>
              <input
                type="text"
                name="companyName"
                id="companyName"
                required
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-900 dark:text-white sm:text-sm p-3 border"
                value={formData.companyName}
                onChange={handleInputChange}
                placeholder="e.g. Acme Corp"
              />
            </div>

            <div>
              <label htmlFor="websiteUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Website URL (Optional)
              </label>
              <input
                type="url"
                name="websiteUrl"
                id="websiteUrl"
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-900 dark:text-white sm:text-sm p-3 border"
                value={formData.websiteUrl}
                onChange={handleInputChange}
                placeholder="https://example.com"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Description
              </label>
              <textarea
                name="description"
                id="description"
                required
                rows={4}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-900 dark:text-white sm:text-sm p-3 border"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Describe your product or service..."
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex justify-center py-3 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Analyzing...' : 'Analyze Market'}
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        {result && (
          <div className="space-y-8 animate-fade-in">
            <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6 border-l-4 border-indigo-500">
              <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">Analysis Summary</h2>
              <p className="text-gray-700 dark:text-gray-300">{result.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {result.keywords.map((keyword, i) => (
                  <span key={i} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                    {keyword}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                  <span>🎯</span> Relevant Subreddits
                </h3>
                <ul className="space-y-2">
                  {result.relevantSubreddits.length > 0 ? (
                    result.relevantSubreddits.map((sub, i) => (
                      <li key={i}>
                        <a
                          href={`https://reddit.com/r/${sub}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium hover:underline"
                        >
                          r/{sub}
                        </a>
                      </li>
                    ))
                  ) : (
                    <li className="text-gray-500 italic">No subreddits found.</li>
                  )}
                </ul>
              </div>

              <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                  <span>💡</span> Setup & Strategy
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Based on your product, here are generated content ideas to engage with the community.
                </p>
                <div className="space-y-4">
                  {result.suggestedContent.map((content, i) => (
                    <div key={i} className="p-3 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 text-sm italic text-gray-700 dark:text-gray-300">
                      "{content}"
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                <span>🔥</span> Top Discussions
              </h3>
              <div className="space-y-4">
                {result.relevantPosts.length > 0 ? (
                  result.relevantPosts.map((post) => (
                    <div key={post.id} className="border-b border-gray-200 dark:border-gray-700 last:border-0 pb-4 last:pb-0">
                      <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-base font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400">
                        {post.title}
                      </a>
                      <div className="mt-1 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <span>r/{post.subreddit}</span>
                        <span>💬 {post.numComments} comments</span>
                        <span>⬆️ {post.score} score</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 italic">No relevant posts found.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
