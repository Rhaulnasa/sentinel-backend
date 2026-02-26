// api/earnings.js — Sentinel Backend: Nasdaq Earnings Proxy

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ ok: false, error: 'date param required (YYYY-MM-DD)' });
  }

  try {
    const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nasdaq.com/',
        'Origin': 'https://www.nasdaq.com',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!r.ok) throw new Error(`Nasdaq returned HTTP ${r.status}`);
    const data = await r.json();

    res.status(200).json({
      ok: true,
      date,
      rows: data?.data?.rows || [],
      count: data?.data?.rows?.length || 0,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(200).json({ ok: false, date, error: e.message, rows: [] });
  }
}
