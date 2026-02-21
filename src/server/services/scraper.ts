export class ScraperService {
  /**
   * No longer scrapes the website via HTTP (Devvit's HTTP plugin blocks external
   * requests in playtest mode). Instead, extracts keywords from the provided
   * description text only. The website URL is passed to Gemini as text context.
   */
  async scrape(url: string, description: string): Promise<{ text: string; keywords: string[] }> {
    // Use description + url as plain text context (no HTTP fetch needed)
    const combinedText = url
      ? `Website: ${url}\n\n${description}`
      : description;

    const keywords = this.extractKeywords(combinedText);
    return { text: combinedText, keywords };
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'and', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'is', 'are', 'was', 'were', 'be', 'by', 'this', 'that', 'it', 'from',
      'as', 'but', 'or', 'not', 'your', 'we', 'our', 'us', 'can', 'will',
      'if', 'you', 'have', 'has', 'they', 'their', 'more', 'all', 'been',
      'also', 'than', 'into', 'about', 'out', 'up', 'so', 'get', 'just',
      'do', 'did', 'how', 'what', 'when', 'where', 'its', 'any', 'new'
    ]);

    const cleanText = text.toLowerCase().replace(/[^\w\s]/g, '');
    const words = cleanText.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));

    const freqMap: Record<string, number> = {};
    for (const word of words) {
      freqMap[word] = (freqMap[word] || 0) + 1;
    }

    return Object.entries(freqMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word]) => word);
  }
}
