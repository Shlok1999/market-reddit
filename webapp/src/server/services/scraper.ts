import * as cheerio from 'cheerio';

export class ScraperService {
  async scrape(url: string, description: string): Promise<{ text: string; keywords: string[] }> {
    let combinedText = description;

    if (url) {
      try {
        console.log(`Scraping: ${url}`);
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; MarketPartnerBot/1.0)',
            'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const html = await response.text();
          const extracted = this.parseWithCheerio(html);
          if (extracted) {
            combinedText += '\n\n' + extracted;
            console.log(`Scraped ${url}: ${extracted.length} chars`);
          }
        }
      } catch (e) {
        console.warn(`Failed to scrape ${url}:`, (e as Error).message);
      }
    }

    return { text: combinedText, keywords: this.extractKeywords(combinedText) };
  }

  private parseWithCheerio(html: string): string {
    const $ = cheerio.load(html);
    $('script, style, noscript, nav, footer, header, aside').remove();

    const parts: string[] = [];

    const title = $('title').first().text().trim();
    if (title) parts.push(title);

    const metaDesc = $('meta[name="description"]').attr('content')?.trim();
    if (metaDesc) parts.push(metaDesc);

    const ogDesc = $('meta[property="og:description"]').attr('content')?.trim();
    if (ogDesc && ogDesc !== metaDesc) parts.push(ogDesc);

    $('h1, h2, h3').each((_, el) => {
      const t = $(el).text().trim();
      if (t) parts.push(t);
    });

    $('p, li').each((_, el) => {
      const t = $(el).text().trim();
      if (t.length > 30 && t.length < 600) parts.push(t);
    });

    return parts.join('\n').replace(/\s+/g, ' ').trim().slice(0, 8000);
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
    const clean = text.toLowerCase().replace(/[^\w\s]/g, '');
    const words = clean.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
    const freq: Record<string, number> = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w]) => w);
  }
}
