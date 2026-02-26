import puppeteer from 'puppeteer';

export class ScraperService {
  async scrape(url: string, description: string): Promise<{ text: string; keywords: string[] }> {
    let combinedText = description;

    if (url) {
      console.log(`Scraping: ${url}`);
      let browser;
      try {
        browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        // Stealth settings
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Go to URL
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait explicitly for SPAs to render some text in the body or #root
        try {
          await page.waitForFunction(
            'document.body.innerText.length > 50', 
            { timeout: 5000 }
          );
        } catch (e) {
          console.log(`Timeout waiting for JS rendering on ${url}. Proceeding with current DOM.`);
        }

        // Extract clean text directly within the browser context
        const extracted = await page.evaluate(() => {
           // Remove non-content elements to avoid noise
           document.querySelectorAll('script, style, noscript, svg, img, iframe, nav, footer, header, aside').forEach(el => el.remove());
           
           // Extract text, replacing multiple whitespace/newlines with a single space
           const text = document.body.innerText || '';
           return text.replace(/\s+/g, ' ').trim().slice(0, 8000);
        });

        if (extracted) {
          combinedText += (combinedText ? '\n\n' : '') + extracted;
          console.log(`Scraped ${url}: ${extracted.length} chars`);
        }
      } catch (e) {
        console.warn(`Failed to scrape ${url}:`, (e as Error).message);
      } finally {
        if (browser) await browser.close();
      }
    }

    return { text: combinedText, keywords: this.extractKeywords(combinedText) };
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
