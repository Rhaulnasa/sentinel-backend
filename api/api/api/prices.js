// api/prices.js — Sentinel Backend: Yahoo Finance Price Proxy

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ ok: false, error: 'symbols param required' });

  const clean = symbols.replace(/[^A-Z,.-]/g, '').substring(0, 200);

  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(clean)}&range=1d&interval=1m`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!r.ok) throw new Error(`Yahoo v8 returned ${r.status}`);
    const data = await r.json();

    const prices = {};
    if (data?.spark?.result) {
      data.spark.result.forEach((item) => {
        if (!item?.symbol) return;
        const meta = item?.response?.[0]?.meta || {};
        if (meta.regularMarketPrice) {
          prices[item.symbol] = {
            price: meta.regularMarketPrice,
            chg:   meta.regularMarketChangePercent || 0,
            vol:   meta.regularMarketVolume || 0,
            avgVol:meta.averageDailyVolume3Month || 0,
            src:   'YF-RT',
          };
        }
      });
    }

    res.status(200).json({ ok: true, prices, fetchedAt: new Date().toISOString() });
  } catch (e) {
    try {
      const r2 = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(clean)}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,averageDailyVolume3Month`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });
      const data2 = await r2.json();
      const prices = {};
      (data2?.quoteResponse?.result || []).forEach((q) => {
        if (q.regularMarketPrice) {
          prices[q.symbol] = {
            price: q.regularMarketPrice,
            chg:   q.regularMarketChangePercent || 0,
            vol:   q.regularMarketVolume || 0,
            avgVol:q.averageDailyVolume3Month || 0,
            src:   'YF-V7',
          };
        }
      });
      res.status(200).json({ ok: true, prices, fetchedAt: new Date().toISOString() });
    } catch (e2) {
      res.status(200).json({ ok: false, error: e2.message, prices: {} });
    }
  }
}
