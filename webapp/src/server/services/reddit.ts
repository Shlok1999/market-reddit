export interface RedditPost {
  id: string;
  title: string;
  url: string;
  permalink: string;
  subreddit: string;
  score: number;
  numComments: number;
  created: number;
  selftext?: string;
}

export interface RedditSubreddit {
  name: string;
  displayName: string;
  subscribers: number;
  description: string;
  url: string;
}

const REDDIT_HEADERS = {
  'User-Agent': 'MarketPartnerBot/1.0 (by /u/market_partner)',
  'Accept': 'application/json',
};

export class RedditService {
  async searchSubreddits(queries: string[]): Promise<RedditSubreddit[]> {
    const found = new Map<string, RedditSubreddit>();

    for (const query of queries.slice(0, 5)) {
      try {
        const url = `https://www.reddit.com/subreddits/search.json?q=${encodeURIComponent(query)}&sort=relevance&limit=8&include_over_18=false`;
        const res = await fetch(url, { headers: REDDIT_HEADERS, signal: AbortSignal.timeout(8000) });

        if (!res.ok) continue;
        const data = await res.json() as { data: { children: { data: { display_name: string; subscribers: number; public_description: string; url: string } }[] } };

        for (const item of data?.data?.children ?? []) {
          const sub = item.data;
          if (sub.subscribers > 500 && !found.has(sub.display_name)) {
            found.set(sub.display_name, {
              name: sub.display_name,
              displayName: `r/${sub.display_name}`,
              subscribers: sub.subscribers,
              description: sub.public_description?.slice(0, 200) || '',
              url: `https://reddit.com${sub.url}`,
            });
          }
        }
      } catch (e) {
        console.warn(`Subreddit search failed for "${query}":`, (e as Error).message);
      }
    }

    return Array.from(found.values()).sort((a, b) => b.subscribers - a.subscribers).slice(0, 15);
  }

  async getHotPosts(subreddit: string, limit = 8): Promise<RedditPost[]> {
    try {
      const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}&t=month`;
      const res = await fetch(url, { headers: REDDIT_HEADERS, signal: AbortSignal.timeout(8000) });

      if (!res.ok) return [];
      const data = await res.json() as { data: { children: { data: { id: string; title: string; url: string; permalink: string; subreddit: string; score: number; num_comments: number; created_utc: number; selftext?: string } }[] } };

      return (data?.data?.children ?? []).map(item => ({
        id: item.data.id,
        title: item.data.title,
        url: item.data.url,
        permalink: `https://reddit.com${item.data.permalink}`,
        subreddit: item.data.subreddit,
        score: item.data.score,
        numComments: item.data.num_comments,
        created: item.data.created_utc,
        selftext: item.data.selftext,
      }));
    } catch (e) {
      console.warn(`Failed to get posts from r/${subreddit}:`, (e as Error).message);
      return [];
    }
  }

  async searchPosts(subreddits: string[], keywords: string[]): Promise<RedditPost[]> {
    const allPosts: RedditPost[] = [];
    const lowerKeywords = keywords.map(k => k.toLowerCase());

    for (const sub of subreddits.slice(0, 8)) {
      const posts = await this.getHotPosts(sub);
      for (const post of posts) {
        const text = (post.title + ' ' + (post.selftext || '')).toLowerCase();
        const relevant = lowerKeywords.length === 0 || lowerKeywords.some(k => text.includes(k));
        if (relevant || post.score > 100) {
          allPosts.push(post);
        }
      }
    }

    return allPosts.sort((a, b) => b.score - a.score).slice(0, 25);
  }

  async getPostComments(subreddit: string, postId: string, limit = 5): Promise<string[]> {
    try {
      const url = `https://www.reddit.com/r/${subreddit}/comments/${postId}.json?limit=${limit}&sort=top&depth=1`;
      const res = await fetch(url, { headers: REDDIT_HEADERS, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return [];
      // Reddit returns [listing_of_post, listing_of_comments]
      const data = await res.json() as [unknown, { data: { children: { data: { body: string; score: number } }[] } }];
      return (data[1]?.data?.children ?? [])
        .filter(c => c.data.body && c.data.body !== '[deleted]' && c.data.score > 0)
        .slice(0, limit)
        .map(c => c.data.body.slice(0, 300));
    } catch (e) {
      console.warn(`Failed to get comments for post ${postId}:`, (e as Error).message);
      return [];
    }
  }
}
