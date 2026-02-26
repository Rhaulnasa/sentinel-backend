export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const date = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    const url = `https://api.nasdaq.com/api/calendar/earnings?date=${date}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nasdaq.com/market-activity/earnings',
        'Origin': 'https://www.nasdaq.com',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return res.status(200).json({ ok: false, date, rows: [], count: 0, error: `Nasdaq ${response.status}` });
    }

    const data = await response.json();
    const rows = (data?.data?.rows || []).map(row => ({
      symbol: (row.symbol || '').replace(/[^A-Z.]/g, ''),
      name: row.name || '',
      epsForecast: row.epsForecast || null,
      lastYearEPS: row.lastYearEPS || null,
      fiscalQuarterEnding: row.fiscalQuarterEnding || '',
      noOfEsts: row.noOfEsts || '',
      time: row.time || '',
    })).filter(r => r.symbol);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.status(200).json({ ok: true, date, rows, count: rows.length, fetchedAt: new Date().toISOString() });

  } catch (err) {
    return res.status(200).json({ ok: false, date, rows: [], count: 0, error: err.message });
  }
}
