export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const symbols = (req.query.symbols || '').toUpperCase().replace(/[^A-Z,]/g, '');
  if (!symbols) {
    return res.status(200).json({ ok: false, error: 'No symbols provided', prices: {} });
  }

  const prices = {};

  try {
    // Yahoo Finance v8 spark — real-time
    const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(symbols)}&range=1d&interval=1m&_=${Date.now()}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok) {
      const data = await response.json();
      if (data?.spark?.result) {
        data.spark.result.forEach(item => {
          if (!item?.symbol) return;
          const resp = item.response?.[0];
          if (!resp) return;
          const meta = resp.meta || {};
          if (meta.regularMarketPrice) {
            prices[item.symbol] = {
              price: meta.regularMarketPrice,
              chg: meta.regularMarketChangePercent || 0,
              vol: meta.regularMarketVolume || 0,
              avgVol: meta.averageDailyVolume3Month || 0,
              src: 'YF-spark',
            };
          }
        });
      }
    }
  } catch (e) {}

  // Fallback: Yahoo Finance v7 quote for any missing symbols
  const missing = symbols.split(',').filter(s => s && !prices[s]);
  if (missing.length) {
    try {
      const url2 = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(missing.join(','))}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,averageDailyVolume3Month&_=${Date.now()}`;
      const response2 = await fetch(url2, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (response2.ok) {
        const data2 = await response2.json();
        if (data2?.quoteResponse?.result) {
          data2.quoteResponse.result.forEach(q => {
            if (q.regularMarketPrice) {
              prices[q.symbol] = {
                price: q.regularMarketPrice,
                chg: q.regularMarketChangePercent || 0,
                vol: q.regularMarketVolume || 0,
                avgVol: q.averageDailyVolume3Month || 0,
                src: 'YF-v7',
              };
            }
          });
        }
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
