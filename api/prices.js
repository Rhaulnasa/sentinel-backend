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

  // METHOD 1: Twelve Data /quote endpoint — supports batching, returns price + change + volume
  if (TWELVE_KEY) {
    try {
      const batch = symList.slice(0, 120).join(',');
      const r = await fetch(
        `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(batch)}&apikey=${TWELVE_KEY}&dp=2`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (r.ok) {
        const d = await r.json();
        // Single symbol: d = {symbol, close, percent_change, volume, ...}
        // Multiple symbols: d = {AAPL: {symbol, close, ...}, MSFT: {...}}
        const processQuote = (q) => {
          if (!q || q.status === 'error' || !q.close) return;
          const sym = q.symbol;
          if (!sym) return;
          prices[sym] = {
            price: parseFloat(q.close) || 0,
            chg: parseFloat(q.percent_change) || 0,
            vol: parseInt(q.volume) || 0,
            avgVol: parseInt(q.average_volume) || 0,
            src: 'TD',
          };
        };
        if (d.symbol) {
          // Single symbol response
          processQuote(d);
        } else {
          // Multi symbol response
          Object.values(d).forEach(q => processQuote(q));
        }
      }
    } catch (e) {
      console.error('Twelve Data error:', e.message);
    }
  }

  // METHOD 2: Yahoo Finance fallback for any missing
  const missing = symList.filter(s => !prices[s]);
  if (missing.length > 0) {
    const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
    for (let i = 0; i < missing.length; i += 10) {
      const batch = missing.slice(i, i + 10).join(',');
      const host = hosts[i % 2];
      try {
        const r = await fetch(
          `https://${host}/v7/finance/quote?symbols=${encodeURIComponent(batch)}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,averageDailyVolume3Month`,
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
            if (q.regularMarketPrice && !prices[q.symbol]) {
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
  }

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=10');
  return res.status(200).json({
    ok: Object.keys(prices).length > 0,
    prices,
    count: Object.keys(prices).length,
    fetchedAt: new Date().toISOString(),
  });
}
