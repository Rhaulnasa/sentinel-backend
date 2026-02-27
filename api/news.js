export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const FEEDS = [
    // === TIER 1: Ultra-fast breaking market news ===
    { url: 'https://www.benzinga.com/feed',                                         src: 'Benzinga' },
    { url: 'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines',     src: 'MarketWatch-RT' },
    { url: 'https://www.nasdaq.com/feed/nasdaq-originals/rss.xml',                  src: 'Nasdaq' },
    { url: 'https://unusualwhales.com/rss/news',                                    src: 'UnusualWhales' },

    // === TIER 2: Major financial outlets ===
    { url: 'https://feeds.reuters.com/reuters/businessNews',                        src: 'Reuters' },
    { url: 'https://feeds.reuters.com/reuters/technologyNews',                      src: 'Reuters-Tech' },
    { url: 'https://feeds.reuters.com/reuters/companyNews',                         src: 'Reuters-Corp' },
    { url: 'https://feeds.bloomberg.com/markets/news.rss',                          src: 'Bloomberg' },
    { url: 'https://feeds.a.dj.com/rss/RSSWSJD.xml',                               src: 'WSJ' },
    { url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html',                  src: 'CNBC' },
    { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',                 src: 'CNBC-Markets' },
    { url: 'https://www.ft.com/technology?format=rss',                              src: 'FT' },
    { url: 'https://www.marketwatch.com/rss/topstories',                            src: 'MarketWatch' },
    { url: 'https://fortune.com/feed/fortune-feeds/?id=3230629',                    src: 'Fortune' },

    // === TIER 3: Tech & AI disruption focused ===
    { url: 'https://techcrunch.com/category/enterprise/feed/',                      src: 'TechCrunch' },
    { url: 'https://techcrunch.com/category/artificial-intelligence/feed/',         src: 'TechCrunch-AI' },
    { url: 'https://www.theverge.com/rss/index.xml',                                src: 'TheVerge' },
    { url: 'https://feeds.feedburner.com/venturebeat/SZYF',                         src: 'VentureBeat' },

    // === TIER 4: Investing & analysis ===
    { url: 'https://seekingalpha.com/feed.xml',                                     src: 'SeekingAlpha' },
    { url: 'https://www.investing.com/rss/news.rss',                                src: 'Investing.com' },
    { url: 'https://news.alphastreet.com/feed',                                     src: 'AlphaStreet' },
  ];

  const articles = [];
  const seen = new Set();

  const parseXML = (xml) => {
    const items = [];
    // Match both RSS <item> and Atom <entry> formats
    const itemRegex = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
    let itemMatch;
    while ((itemMatch = itemRegex.exec(xml)) !== null) {
      const block = itemMatch[1];
      const get = (tag) => {
        const m = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
        return m ? m[1].trim() : '';
      };
      const getLinkAttr = () => {
        const m = block.match(/<link[^>]+href="([^"]+)"/i) || block.match(/<link[^>]*>([^<]+)<\/link>/i);
        return m ? m[1].trim() : '';
      };
      const title = get('title').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '').replace(/<[^>]+>/g, '').trim();
      const link = get('link') || getLinkAttr();
      const desc = get('description').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim().slice(0, 200);
      const pubDate = get('pubDate') || get('published') || get('updated');
      if (title && title.length > 10) {
        items.push({ title, link, desc, pubDate });
      }
    }
    return items;
  };

  // Fetch all feeds in parallel
  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const r = await fetch(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const xml = await r.text();
      const items = parseXML(xml);
      return items.map(item => ({ ...item, source: feed.src }));
    })
  );

  // Collect all articles, deduplicate by title
  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const article of result.value) {
        const key = article.title.slice(0, 60).toLowerCase().replace(/\s+/g, '');
        if (!seen.has(key)) {
          seen.add(key);
          articles.push({
            title: article.title,
            desc: article.desc || '',
            link: article.link || '',
            source: article.source,
            publishedAt: article.pubDate || new Date().toISOString(),
          });
        }
      }
    }
  }

  // Sort by date (newest first)
  articles.sort((a, b) => {
    const da = new Date(a.publishedAt).getTime() || 0;
    const db = new Date(b.publishedAt).getTime() || 0;
    return db - da;
  });

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
  return res.status(200).json({
    ok: true,
    articles: articles.slice(0, 150),
    count: articles.length,
    sources: [...new Set(articles.map(a => a.source))],
    fetchedAt: new Date().toISOString(),
  });
}
