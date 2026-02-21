export class AIService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

  constructor() {
    // Attempt to get API key from environment
    this.apiKey = 'AIzaSyA-gNUEylPTzemIPdCAcX7itTLSJYGMEhM';
  }

  async suggestSubreddits(companyName: string, description: string, websiteUrl: string): Promise<string[]> {
    if (!this.apiKey) {
      console.warn('GEMINI_API_KEY is not set. Skipping AI subreddit suggestion.');
      return [];
    }

    try {
      const prompt = `
        You are a Reddit marketing expert. Analyze this company/product:
        Company: "${companyName}"
        Description: "${description}"
        Website: ${websiteUrl}

        Suggest 12 relevant subreddits where this product could be marketed.
        Focus on the exact niche (e.g. for cloud gaming: cloudgaming, GeForceNow, ShadowPC etc).
        Return ONLY a JSON array of subreddit names (no r/ prefix, no markdown).
        Example: ["cloudgaming", "GeForceNow", "pcgaming"]
      `;

      const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      });

      if (!response.ok) {
        console.error(`Gemini API Error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      
      // Parse Gemini response structure
      // { candidates: [ { content: { parts: [ { text: "..." } ] } } ] }
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!textResponse) return [];

      // Clean up potential markdown code blocks if the model ignores instruction
      const cleanJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const subreddits = JSON.parse(cleanJson);
      
      if (Array.isArray(subreddits)) {
        return subreddits.map((s: string) => s.trim());
      }
      
      return [];

    } catch (error) {
      console.error('Error calling Gemini API:', error);
      return [];
    }
  }

  /**
   * Generates targeted Reddit search queries based on scraped content.
   * These queries are used to search for relevant subreddits via Reddit's API.
   */
  async generateSearchQueries(companyName: string, description: string, websiteUrl: string): Promise<string[]> {
    if (!this.apiKey) {
      return [];
    }

    try {
      const prompt = `
        You are a Reddit marketing expert.
        Analyze this company/product:
        Company: "${companyName}"
        Description: "${description}"
        Website: ${websiteUrl}

        Generate 5 short, specific search queries (2-4 words) to find relevant subreddits.
        Focus on the product category, target audience, and use cases.
        Return ONLY a JSON array of strings. No markdown.
        Example: ["cloud gaming PC", "game streaming service", "remote gaming setup"]
      `;

      const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3 }
        })
      });

      if (!response.ok) {
        console.error(`Gemini API Error: ${response.status}`);
        return [];
      }

      const data = await response.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) return [];

      const cleanJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      const queries = JSON.parse(cleanJson);
      
      return Array.isArray(queries) ? queries.map((q: string) => q.trim()) : [];

    } catch (error) {
      console.error('Error generating search queries:', error);
      return [];
    }
  }
}
