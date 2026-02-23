import { Router } from 'express';
import { ScraperService } from '../services/scraper.js';
import { AIService } from '../services/ai.js';
import { RedditService } from '../services/reddit.js';

export const apiRouter = Router();

if (!process.env.GEMINI_API_KEY) {
  console.warn('⚠️ GEMINI_API_KEY is missing from environment variables');
}

const scraper = new ScraperService();
const reddit = new RedditService();

apiRouter.post('/analyze', async (req, res) => {
  const ai = new AIService(process.env.GEMINI_API_KEY || '');
  try {
    const { companyName, description, websiteUrl } = req.body as {
      companyName: string;
      description: string;
      websiteUrl?: string;
    };

    if (!companyName || !description) {
      return res.status(400).json({ success: false, error: 'Company name and description are required' });
    }

    console.log(`\n🔍 Analyzing: ${companyName}`);

    // 1. Scrape website
    const { text: siteContent, keywords: descKeywords } = await scraper.scrape(websiteUrl || '', description);

    // 2. Ask Gemini for subreddits + keywords
    const { subreddits: aiSubreddits, keywords: aiKeywords } = await ai.analyze(
      companyName, description, websiteUrl || '', siteContent
    );
    console.log(`🤖 Gemini suggested: ${aiSubreddits.join(', ')}`);

    // 3. Search Reddit for subreddits
    const allQueries = [...new Set([...aiSubreddits.slice(0, 3), ...descKeywords.slice(0, 3)])];
    const subredditsFound = await reddit.searchSubreddits(allQueries);

    const subredditNames = [
      ...aiSubreddits,
      ...subredditsFound.map(s => s.name)
    ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 15);

    // 4. Fetch relevant posts
    const keywords = [...new Set([...aiKeywords, ...descKeywords])].slice(0, 20);
    const posts = await reddit.searchPosts(subredditNames, keywords);
    console.log(`📝 Found ${posts.length} relevant posts`);

    // 5. Generate reply suggestions for top 5 posts (in parallel)
    console.log(`💬 Generating reply suggestions...`);
    const postsWithReplies = await Promise.all(
      posts.slice(0, 5).map(async post => {
        const comments = await reddit.getPostComments(post.subreddit, post.id);
        const replies = await ai.generateReplies(
          companyName, description, websiteUrl || '',
          { title: post.title, subreddit: post.subreddit, selftext: post.selftext },
          comments
        );
        return { ...post, suggestedReplies: replies };
      })
    );

    // Merge reply-enriched posts with the rest
    const allPosts = [
      ...postsWithReplies,
      ...posts.slice(5).map(p => ({ ...p, suggestedReplies: [] as string[] }))
    ];

    return res.json({
      success: true,
      data: {
        summary: `Analyzed ${companyName}. Found ${allPosts.length} discussions across ${subredditNames.length} subreddits, with reply suggestions for the top ${postsWithReplies.length} posts.`,
        keywords,
        relevantSubreddits: subredditNames,
        subredditDetails: subredditsFound,
        relevantPosts: allPosts,
        websiteScraped: !!(siteContent && siteContent !== description),
      }
    });

  } catch (err) {
    console.error('Analysis error:', err);
    return res.status(500).json({ success: false, error: 'Analysis failed' });
  }
});
