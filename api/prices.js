// Twelve Data free tier: 800 req/day, no credit card
// Sign up at: https://twelvedata.com/register
// Get API key from: https://twelvedata.com/account/api-keys
// Set env var TWELVE_DATA_KEY in Vercel dashboard

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const symbols = (req.query.symbols || '').toUpperCase().replace(/[^A-Z,]/g, '');
  if (!symbols) return res.status(200).json({ ok: false, error: 'No symbols', prices: {} });

  const symList = [...new Set(symbols.split(',').filter(Boolean))];
  const prices = {};
  const TWELVE_KEY = process.env.TWELVE_DATA_KEY;

  // METHOD 1: Twelve Data (free, no IP blocking, works from Vercel)
  if (TWELVE_KEY) {
    try {
      const batch = symList.slice(0, 120).join(','); // free tier supports batch
      const r = await fetch(
        `https://api.twelvedata.com/price?symbol=${encodeURIComponent(batch)}&apikey=${TWELVE_KEY}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (r.ok) {
        const d = await r.json();
        // If single symbol returns {price: "123.45"}
        // If multiple returns {AAPL: {price: "123.45"}, MSFT: {price: "456.78"}}
        if (d.price && symList.length === 1) {
          prices[symList[0]] = { price: parseFloat(d.price), chg: 0, vol: 0, avgVol: 0, src: 'TD' };
        } else {
          Object.entries(d).forEach(([sym, val]) => {
            if (val?.price && !val?.code) {
              prices[sym] = { price: parseFloat(val.price), chg: 0, vol: 0, avgVol: 0, src: 'TD' };
            }
          });
        }
      }
    } catch (e) {}

    // Get change % for loaded symbols using quote endpoint
    const loaded = Object.keys(prices);
    if (loaded.length) {
      try {
        const r2 = await fetch(
          `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(loaded.slice(0,8).join(','))}&apikey=${TWELVE_KEY}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (r2.ok) {
          const d2 = await r2.json();
          const processQuote = (sym, q) => {
            if (q && q.close && prices[sym]) {
              prices[sym].chg = parseFloat(q.percent_change || 0);
              prices[sym].vol = parseInt(q.volume || 0);
              prices[sym].price = parseFloat(q.close);
            }
          };
          if (d2.symbol) {
            processQuote(d2.symbol, d2);
          } else {
            Object.entries(d2).forEach(([sym, q]) => processQuote(sym, q));
          }
        }
      } catch (e) {}
    }
  }

  // METHOD 2: Yahoo Finance fallback (works ~50% of time from Vercel)
  const missing = symList.filter(s => !prices[s]);
  if (missing.length) {
    try {
      const r = await fetch(
        `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(missing.slice(0,10).join(','))}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,averageDailyVolume3Month`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(6000),
        }
      );
      if (r.ok) {
        const d = await r.json();
        (d?.quoteResponse?.result || []).forEach(q => {
          if (q.regularMarketPrice) {
            prices[q.symbol] = {
              price: Math.round(q.regularMarketPrice * 100) / 100,
              chg: Math.round((q.regularMarketChangePercent || 0) * 100) / 100,
              vol: q.regularMarketVolume || 0,
              avgVol: q.averageDailyVolume3Month || 0,
              src: 'YF',
            };
          }
        });
      }
    } catch (e) {}
  }

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=10');
  return res.status(200).json({
    ok: Object.keys(prices).length > 0,
    prices,
    count: Object.keys(prices).length,
    fetchedAt: new Date().toISOString(),
  });
}
