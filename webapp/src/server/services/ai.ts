const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

export class AIService {
  constructor(private readonly apiKey: string) {}

  async analyze(companyName: string, description: string, websiteUrl: string, siteContent: string): Promise<{
    subreddits: string[];
    keywords: string[];
  }> {
    const context = siteContent
      ? `\nWebsite content:\n${siteContent.slice(0, 4000)}`
      : '';

    const prompt = `
      You are a Reddit marketing expert. Analyze this company/product:
      Company: "${companyName}"
      Description: "${description}"
      Website: ${websiteUrl}${context}

      Return a JSON object:
      {
        "subreddits": [12 specific subreddit names, no r/, no markdown],
        "keywords": [10 search keywords to find relevant Reddit discussions]
      }

      Be highly specific to the niche. For cloud gaming: cloudgaming, GeForceNow, ShadowPC.
      Return ONLY the JSON, no explanation.
    `;

    try {
      const res = await fetch(`${GEMINI_URL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });

      if (!res.ok) {
        console.error('Gemini error:', res.status, await res.text());
        return { subreddits: [], keywords: [] };
      }

      const data = await res.json() as { candidates: { content: { parts: { text: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(clean);
      return {
        subreddits: Array.isArray(parsed.subreddits) ? parsed.subreddits : [],
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      };
    } catch (e) {
      console.error('Gemini error:', e);
      return { subreddits: [], keywords: [] };
    }
  }
  async generateReplies(
    companyName: string,
    description: string,
    websiteUrl: string,
    post: { title: string; subreddit: string; selftext?: string },
    topComments: string[]
  ): Promise<string[]> {
    const commentsCtx = topComments.length > 0
      ? `\nTop comments:\n${topComments.slice(0, 5).map((c, i) => `${i + 1}. "${c}"`).join('\n')}`
      : '';

    const prompt = `
      You are a Reddit marketing expert helping a company engage authentically.

      Company: "${companyName}"
      Product: "${description}"
      Website: ${websiteUrl}

      Reddit post in r/${post.subreddit}:
      Title: "${post.title}"
      ${post.selftext ? `Content: "${post.selftext.slice(0, 500)}"` : ''}${commentsCtx}

      Write 3 short, helpful Reddit replies that:
      1. Actually help the person / add value to the discussion
      2. Subtly mention or reference the product ONLY when naturally relevant
      3. Sound like a genuine Redditor, NOT a marketer
      4. Are concise (2-5 sentences max)
      5. Do NOT use emojis or salesy language

      Return a JSON array of 3 reply strings.
      Example: ["Reply 1 text", "Reply 2 text", "Reply 3 text"]
      Return ONLY the JSON array, no explanation.
    `;

    try {
      const res = await fetch(`${GEMINI_URL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!res.ok) return [];
      const data = await res.json() as { candidates: { content: { parts: { text: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(clean);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
