import { Router } from "express";
import { ScraperService } from "../services/scraper.js";
import { AIService } from "../services/ai.js";
import { RedditService } from "../services/reddit.js";
import dotenv from "dotenv";

dotenv.config();

export const streamRouter = Router();

const scraper = new ScraperService();
const reddit = new RedditService();
const ai = new AIService(process.env.GEMINI_API_KEY || "");

streamRouter.post("/stream-analyze-scrape", async (req, res) => {
  const { companyName, description = "", websiteUrl } = req.body;

  if (!companyName) {
    res.status(400).end();
    return;
  }

  // SSE HEADERS (CRITICAL)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // React-compatible sender
  const send = (payload: any) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    // ---------- SCRAPE
    send({ type: "stage", step: "scraping" });
    let { text: siteContent, keywords: descKeywords } =
      await scraper.scrape(websiteUrl || "", description);

    console.log('\n=== SCRAPING RESULT ===');
    console.log('Site Content Preview:', siteContent.substring(0, 1000) + (siteContent.length > 1000 ? '...' : ''));
    console.log('Keywords:', descKeywords);
    console.log('=======================\n');

    let finalDescription = siteContent;

    if (siteContent.length > 50) {
        // ---------- AI SUMMARIZE
        send({ type: "stage", step: "summarizing" });
        try {
            console.log("Generating summary via AI. Content length:", siteContent.length);
            const summaryData = await ai.summarizeWebsite(siteContent);
            if (summaryData && summaryData.description) {
                finalDescription = summaryData.description;
                descKeywords = summaryData.keywords && summaryData.keywords.length > 0 ? summaryData.keywords : descKeywords;
                console.log("Summary generated:", summaryData.description);
                console.log("AI Keywords:", summaryData.keywords);
            } else {
                console.log("Summary generated but empty");
            }
        } catch (aiErr) {
            console.error("AI summarization failed, falling back to raw text:", aiErr);
        }
    }

    send({ type: "summary", data: finalDescription }); // Send description as summary to populate UI
    send({ type: "keywords", data: descKeywords });
    send({ type: "done" });

    res.end();
  } catch (err: any) {
    send({ type: "error", message: err.message });
    res.end();
  }
});

streamRouter.post("/stream-analyze-continue", async (req, res) => {
  const { companyName, description, websiteUrl, keywords: bodyKeywords } = req.body;

  if (!companyName || !description) {
    res.status(400).end();
    return;
  }

  // SSE HEADERS (CRITICAL)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // React-compatible sender
  const send = (payload: any) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    // Start with provided AI keywords, fallback to simple scraping if none provided
    const descKeywords = bodyKeywords && bodyKeywords.length > 0 ? bodyKeywords : (await scraper.scrape("", description)).keywords;

    // ---------- FIND SUBREDDITS
    send({ type: "stage", step: "analyzing" });
    const allQueries = [
      ...new Set([...descKeywords.slice(0, 5)])
    ];

    const subredditsFound = await reddit.searchSubreddits(allQueries);

    send({ type: "subreddit_details", data: subredditsFound });
    send({ type: "subreddits", data: subredditsFound.map(s => s.name).slice(0, 15) });

    // ---------- POSTS
    send({ type: "stage", step: "finding_posts" });

    const keywords = [...new Set([...descKeywords])].slice(0, 20);
    const subredditNames = subredditsFound.map(s => s.name).slice(0, 15);

    const posts = await reddit.searchPosts(subredditNames, keywords);

    send({ type: "posts", data: posts });

    // MOCK RESPONSES TO SKIP AI FOR REPLIES
    send({ type: "stage", step: "generating_replies" });
    send({ type: "summary", data: `Analyzed ${companyName}. Found ${posts.length} discussions across ${subredditNames.length} subreddits.` });
    send({ type: "usage", data: { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, costUsd: 0, modelUsed: "none" } });
    send({ type: "done" });

    res.end();

  } catch (err: any) {
    send({ type: "error", message: err.message });
    res.end();
  }
});