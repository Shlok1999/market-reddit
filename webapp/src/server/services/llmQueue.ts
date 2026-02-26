import PQueue from "p-queue";

/**
 * Gemini free tier safe limits
 * ~60 requests/minute → we keep margin
 */
export const llmQueue = new PQueue({
    concurrency: 5,
    interval: 60_000,
    intervalCap: 55,
});