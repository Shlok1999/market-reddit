import { reddit } from '@devvit/web/server';
import { RedditPost, RedditComment } from '../../shared/api';

export class RedditService {
  /**
   * Validates a list of subreddit names using the built-in Devvit Reddit SDK.
   */
  async validateSubreddits(names: string[]): Promise<string[]> {
    if (names.length === 0) return [];
    const valid: string[] = [];
    for (const name of names) {
      try {
        await reddit.getSubredditInfoByName(name);
        valid.push(name);
      } catch {
        // Subreddit doesn't exist or is private — skip
      }
    }
    console.log(`Validated ${valid.length}/${names.length} subreddits`);
    return valid;
  }

  async searchSubreddits(keywords: string[]): Promise<string[]> {
    return keywords;
  }

  async searchPosts(keywords: string[], subreddits: string[]): Promise<RedditPost[]> {
    try {
      if (subreddits.length === 0) return [];

      const allPosts: RedditPost[] = [];
      const lowerKeywords = keywords.map(k => k.toLowerCase());

      for (const subreddit of subreddits) {
        try {
          const listings = await reddit.getHotPosts({
            subredditName: subreddit,
            limit: 5,
          });

          for await (const post of listings) {
            const title = post.title.toLowerCase();
            const body = post.body?.toLowerCase() || '';

            // Include if keyword matches OR it's a top post (score > 50)
            const isRelevant = lowerKeywords.length === 0
              || lowerKeywords.some(k => title.includes(k) || body.includes(k));
            const isTopPost = (post.score ?? 0) > 50;

            if (isRelevant || isTopPost) {
              allPosts.push({
                id: post.id,
                title: post.title,
                url: post.url,
                subreddit: post.subredditName,
                score: post.score,
                numComments: post.numberOfComments,
                created: post.createdAt.getTime(),
              });
            }
          }
        } catch (e) {
          // Subreddit may be banned or restricted — skip silently
          console.warn(`Skipping ${subreddit}:`, (e as Error).message?.substring(0, 80));
        }
      }

      return allPosts.sort((a, b) => b.score - a.score).slice(0, 20);

    } catch (error) {
      console.error('Error searching posts:', error);
      return [];
    }
  }

  async getRelevantComments(posts: RedditPost[]): Promise<RedditComment[]> {
    try {
      const comments: RedditComment[] = [];

      for (const post of posts.slice(0, 3)) {
        try {
          const postComments = await reddit.getComments({
            postId: post.id.startsWith('t3_') ? post.id as `t3_${string}` : `t3_${post.id}`,
            limit: 10,
            sort: 'top'
          });

          for await (const comment of postComments) {
            comments.push({
              id: comment.id,
              body: comment.body,
              author: comment.authorName,
              permalink: comment.permalink,
              subreddit: comment.subredditName,
              score: comment.score,
              created: comment.createdAt.getTime()
            });
          }
        } catch (e) {
          console.error(`Error fetching comments for post ${post.id}:`, e);
        }
      }

      return comments;
    } catch (error) {
      console.error('Error fetching comments:', error);
      return [];
    }
  }
}
