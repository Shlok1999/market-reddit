const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

type GeminiResponse = {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
  }[];
};

type AnalyzeResult = {
  persona: string;
  subreddits: string[];
  keywords: string[];
};

export class AIService {
  constructor(private readonly apiKey: string) {}

  // -----------------------------
  // Core Gemini Call
  // -----------------------------
  private async callGemini(prompt: string, retries = 2): Promise<string> {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${this.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            topP: 0.9,
            topK: 40,
            maxOutputTokens: 1024,
          },
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      const data = (await res.json()) as GeminiResponse;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) throw new Error("Empty Gemini response");

      return text;
    } catch (err) {
      if (retries > 0) return this.callGemini(prompt, retries - 1);
      throw err;
    }
  }

  // -----------------------------
  // Robust JSON extractor
  // -----------------------------
  private extractJSON<T>(text: string): T {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new Error("No JSON found in model output");
    return JSON.parse(match[0]);
  }

  // -----------------------------
  // ANALYZE (Subreddits + Keywords)
  // -----------------------------
  async analyze(
    companyName: string,
    description: string,
    websiteUrl: string,
    siteContent: string
  ): Promise<AnalyzeResult> {
    const context = siteContent
      ? `\nWebsite Content:\n${siteContent.slice(0, 4000)}`
      : "";

    const prompt = `
You are a B2B Reddit research analyst.

Your task is NOT to promote the product.
Your task is to locate discussions where potential buyers experience the problem BEFORE vendor search.

PRODUCT
Company: ${companyName}
Description: ${description}
Website: ${websiteUrl}
${context}

INTERNAL REASONING (DO NOT OUTPUT):
1) Identify the main persona
2) Identify real frustrations they encounter
3) Determine how they phrase questions online
4) Map to specific Reddit communities

RULES:
- Avoid generic subs unless unavoidable
- Prefer niche & problem-focused communities
- Include competitor/tool communities when relevant
- Keywords must be natural sentences, not SEO phrases

OUTPUT STRICT JSON:
{
  "persona": "short persona description",
  "subreddits": ["12 real subreddit names"],
  "keywords": ["10 natural discussion search queries"]
}

Return JSON only.
`;

    try {
      const text = await this.callGemini(prompt);
      return this.extractJSON<AnalyzeResult>(text);
    } catch (err) {
      console.error("Analyze error:", err);
      return { persona: "", subreddits: [], keywords: [] };
    }
  }

  // -----------------------------
  // GENERATE REDDIT REPLIES
  // -----------------------------
  async generateReplies(
    companyName: string,
    description: string,
    websiteUrl: string,
    post: { title: string; subreddit: string; selftext?: string },
    topComments: string[]
  ): Promise<string[]> {
    const commentsCtx =
      topComments.length > 0
        ? `Top comments:\n${topComments
            .slice(0, 5)
            .map((c, i) => `${i + 1}. ${c}`)
            .join("\n")}`
        : "";

    const prompt = `
You are writing as a normal Reddit user, not a company.

Goal: participate naturally in discussion.
You are NOT selling anything.

COMPANY CONTEXT
Name: ${companyName}
Product: ${description}
Website: ${websiteUrl}

THREAD
Subreddit: r/${post.subreddit}
Title: ${post.title}
${post.selftext ? `Post: ${post.selftext.slice(0, 500)}` : ""}
${commentsCtx}

REPLY STRATEGY
Write 3 different replies:

Reply 1 → empathy / shared experience
Reply 2 → practical advice
Reply 3 → optional soft recommendation (only if relevant)

STYLE RULES
- sound human
- no marketing tone
- no CTA
- no links
- 2–5 sentences
- casual natural language
- only one reply may mention the product
- never say "our product"

OUTPUT:
["reply 1","reply 2","reply 3"]

Return JSON array only.
`;

    try {
      const text = await this.callGemini(prompt);
      const parsed = this.extractJSON<string[]>(text);
      return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
    } catch (err) {
      console.error("Reply error:", err);
      return [];
    }
  }
}