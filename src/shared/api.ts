export type AnalysisRequest = {
  companyName: string;
  description: string;
  websiteUrl?: string;
  suggestedSubreddits?: string[]; // Pre-computed by client via Gemini (browser fetch)
  suggestedKeywords?: string[];   // Gemini-suggested keywords for better post matching
};

export type RedditPost = {
  id: string;
  title: string;
  url: string;
  subreddit: string;
  score: number;
  numComments: number;
  created: number;
};

export type RedditComment = {
  id: string;
  body: string;
  author: string;
  permalink: string;
  subreddit: string;
  score: number;
  created: number;
};

export type AnalysisResult = {
  summary: string;
  keywords: string[];
  relevantSubreddits: string[];
  relevantPosts: RedditPost[];
  relevantComments: RedditComment[];
  suggestedContent: string[];
};

export type AnalysisResponse = {
  success: boolean;
  data?: AnalysisResult;
  error?: string;
};
