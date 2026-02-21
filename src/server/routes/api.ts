import { Hono } from 'hono';
import { AnalysisRequest, AnalysisResult, AnalysisResponse } from '../../shared/api';
import { ScraperService } from '../services/scraper';
import { RedditService } from '../services/reddit';
import { ContentService } from '../services/content';

export const api = new Hono();

const scraperService = new ScraperService();
const redditService = new RedditService();
const contentService = new ContentService();

api.post('/analyze', async (c) => {
  try {
    const request = await c.req.json<AnalysisRequest>();
    const { companyName, description, websiteUrl, suggestedSubreddits, suggestedKeywords } = request;

    if (!companyName || !description) {
      return c.json<AnalysisResponse>({
        success: false,
        error: 'Company name and description are required',
      }, 400);
    }

    // 1. Extract basic keywords from description (as fallback)
    const { keywords: descKeywords } = await scraperService.scrape(websiteUrl || '', description);

    // Merge Gemini-suggested keywords with description keywords (Gemini takes priority)
    const keywords = suggestedKeywords && suggestedKeywords.length > 0
      ? [...suggestedKeywords, ...descKeywords].slice(0, 20)
      : descKeywords;

    // 2. Use subreddits suggested by Gemini (called client-side from browser)
    const rawSubreddits = suggestedSubreddits && suggestedSubreddits.length > 0
      ? suggestedSubreddits
      : keywords.slice(0, 5);

    const relevantSubredditsNames = await redditService.validateSubreddits(rawSubreddits);

    // 3. Fetch hot posts from validated subreddits and filter by keywords
    const relevantPosts = await redditService.searchPosts(keywords, relevantSubredditsNames);

    // 4. Fetch comments from top posts
    const relevantComments = await redditService.getRelevantComments(relevantPosts);

    // 5. Generate content suggestions
    const suggestedContent = contentService.generateSuggestions(companyName, keywords, relevantPosts);

    const result: AnalysisResult = {
      summary: `Analyzed ${companyName}. Found ${keywords.length} keywords and ${relevantPosts.length} relevant discussions across ${relevantSubredditsNames.length} subreddits (via Gemini AI).`,
      keywords,
      relevantSubreddits: relevantSubredditsNames,
      relevantPosts,
      relevantComments,
      suggestedContent
    };

    return c.json<AnalysisResponse>({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Analysis error:', error);
    return c.json<AnalysisResponse>({
      success: false,
      error: 'Failed to analyze company details',
    }, 500);
  }
});
