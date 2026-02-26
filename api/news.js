// api/news.js — Sentinel Backend: RSS News Proxy

const FEEDS = [
  { url: 'https://feeds.reuters.com/reuters/businessNews',       name: 'Reuters' },
  { url: 'https://feeds.reuters.com/reuters/technologyNews',     name: 'Reuters Tech' },
  { url: 'https://feeds.reuters.com/reuters/companyNews',        name: 'Reuters Corp' },
  { url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html', name: 'CNBC' },
  { url: 'https://feeds.a.dj.com/rss/RSSWSJD.xml',              name: 'WSJ' },
  { url: 'https://www.ft.com/technology?format=rss',             name: 'FT' },
  { url: 'https://www.marketwatch.com/rss/topstories',           name: 'MarketWatch' },
  { url: 'https://feeds.bloomberg.com/markets/news.rss',         name: 'Bloomberg' },
  { url: 'https://techcrunch.com/category/enterprise/feed/',     name: 'TechCrunch' },
];

function parseRSS(xml, sourceName) {
  const items = [];
  const parts = xml.split('<item');
  for (let i = 1; i < parts.length && items.length < 15; i++) {
    const block = parts[i].split('</item>')[0];
    const extract = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
      if (!m) return '';
      return m[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .trim();
    };
    const title = extract('title');
    const desc  = extract('description').substring(0, 150);
    let   link  = extract('link') || extract('guid');
    if (!link || !link.startsWith('http')) {
      const m = block.match(/https?:\/\/[^\s<"]+/);
      link = m ? m[0] : '#';
    }
    if (title && title.length > 10) {
      items.push({ title, desc, link, source: sourceName });
    }
  }
  return items;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const results = [];
  const errors  = [];

  await Promise.allSettled(
    FEEDS.map(async (feed) => {
      try {
        const r = await fetch(feed.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SentinelBot/1.0)' },
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const xml = await r.text();
        const items = parseRSS(xml, feed.name);
        results.push(...items);
      } catch (e) {
        errors.push({ feed: feed.name, error: e.message });
      }
    })
  );

  res.status(200).json({
    ok: true,
    count: results.length,
    articles: results,
    errors: errors.length ? errors : undefined,
    fetchedAt: new Date().toISOString(),
  });
}
