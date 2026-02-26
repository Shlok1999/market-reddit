import { llmQueue } from "./llmQueue.js";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

type GeminiResponse = {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
  }[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
};

type AnalyzeResult = {
  persona: string;
  subreddits: string[];
  keywords: string[];
};

// ===================== SCHEMAS =====================

const ANALYZE_SCHEMA = {
  type: "object",
  properties: {
    persona: { type: "string" },
    subreddits: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } },
  },
  required: ["persona", "subreddits", "keywords"],
};

const REPLY_SCHEMA = {
  type: "array",
  items: { type: "string" },
};

export class AIService {
  private totalInputTokens = 0;
  private totalOutputTokens = 0;

  constructor(private readonly apiKey: string) {}

  // =========================================================
  // STRUCTURED GEMINI CALL (guaranteed JSON)
  // =========================================================
  private async callGeminiJSON<T>(
    prompt: string,
    schema: any,
    retries = 2
  ): Promise<T> {
    return llmQueue.add(async () => {
      try {
        const res = await fetch(`${GEMINI_URL}?key=${this.apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 900,
              responseMimeType: "application/json",
              responseSchema: schema,
            },
          }),
        });

        // retry transient
        if (res.status === 429 || res.status >= 500) {
          if (retries > 0) {
            await new Promise(r => setTimeout(r, 1500));
            return this.callGeminiJSON(prompt, schema, retries - 1);
          }
        }

        if (!res.ok) throw new Error(await res.text());

        const data = (await res.json()) as GeminiResponse;

        if (data.usageMetadata) {
          this.totalInputTokens += data.usageMetadata.promptTokenCount || 0;
          this.totalOutputTokens += data.usageMetadata.candidatesTokenCount || 0;
        }

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Empty structured response");

        return JSON.parse(text) as T;
      } catch (err) {
        if (retries > 0) return this.callGeminiJSON(prompt, schema, retries - 1);
        throw err;
      }
    });
  }

    // =========================================================
    // SUMMARIZE SCRAPED WEBSITE AND EXTRACT KEYWORDS
    // =========================================================
    async summarizeWebsite(siteContent: string): Promise<{ description: string; keywords: string[] }> {
      const trimmedContent = siteContent?.slice(0, 10000) || "";
  
      const prompt = `
  You are an expert product marketer. I have scraped a company's website. 
  
  TASK 1: Read the following website content and write a concise, punchy 2-3 sentence product description.
  It should clearly state what the product is and who it is for. Total length under 400 characters.
  
  TASK 2: Based on your generated summary and the content, extract 10-15 highly relevant SEO and marketing keywords that best represent this product's core value offering.
  
  Website Content:
  ${trimmedContent}
  
  Return the data matching the JSON schema exactly.
  `;
      
      const schema = {
          type: "object",
          properties: {
              description: { type: "string" },
              keywords: { type: "array", items: { type: "string" } },
          },
          required: ["description", "keywords"],
      };
      
      try {
        return await this.callGeminiJSON<{description: string; keywords: string[]}>(prompt, schema);
      } catch (err) {
        console.error("Summarize error:", err);
        return { description: "", keywords: [] };
      }
    }
  
    // =========================================================
    // ANALYZE COMPANY → TARGET REDDIT USERS
    // =========================================================
    async analyze(
      companyName: string,
      description: string,
      websiteUrl: string,
      siteContent: string
    ): Promise<AnalyzeResult> {
      const trimmedContent = siteContent?.slice(0, 3000) || "";
  
      const prompt = `
  You are an expert Reddit digital marketing and customer research analyst.
  
  Your job is to identify highly specific, niche subreddits where the exact target audience for the following product hangs out, and the specific keywords they use when discussing the problems this product solves.
  DO NOT suggest default or massive generic subreddits (e.g., r/business, r/politics, r/technology, r/news). Only suggest highly relevant, niche communities (e.g., r/humanresources, r/msp, r/plumbing).
  
  Company: ${companyName}
  Product: ${description}
  Website: ${websiteUrl}
  
  Website Context:
  ${trimmedContent}
  
  Return the data matching the JSON schema exactly.
  `;
  
      try {
        return await this.callGeminiJSON<AnalyzeResult>(prompt, ANALYZE_SCHEMA);
      } catch (err) {
        console.error("Analyze error:", err);
        return { persona: "", subreddits: [], keywords: [] };
      }
    }

  // =========================================================
  // GENERATE HUMAN-LIKE REPLIES
  // =========================================================
  async generateReplies(
    companyName: string,
    description: string,
    websiteUrl: string,
    post: { title: string; subreddit: string; selftext?: string },
    topComments: string[]
  ): Promise<string[]> {
    const commentsCtx = topComments.slice(0, 5).join("\n");

    const prompt = `
Act like a real Reddit user.

Do not advertise.
No links.
No marketing tone.

Subreddit: r/${post.subreddit}
Title: ${post.title}
Post: ${(post.selftext || "").slice(0, 400)}

Comments:
${commentsCtx}

Write 3 natural replies:
1 empathy
1 helpful suggestion
1 optional subtle mention if relevant
`;

    try {
      const replies = await this.callGeminiJSON<string[]>(prompt, REPLY_SCHEMA);
      return replies.slice(0, 3);
    } catch (err) {
      console.error("Reply error:", err);
      return [];
    }
  }

  // =========================================================
  // COST TRACKING
  // =========================================================
  getUsageStats() {
    const inputCost = (this.totalInputTokens / 1_000_000) * 0.075;
    const outputCost = (this.totalOutputTokens / 1_000_000) * 0.30;

    return {
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
      costUsd: Number((inputCost + outputCost).toFixed(6)),
      modelUsed: "gemini-2.0-flash",
    };
  }
}