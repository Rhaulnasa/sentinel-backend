// api/index.js — Health check endpoint

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    name: 'Sentinel Backend',
    version: '1.0.0',
    status: 'online',
    endpoints: [
      'GET /api/news           — RSS feeds from Reuters, Bloomberg, CNBC, WSJ, FT',
      'GET /api/earnings?date=YYYY-MM-DD — Nasdaq earnings calendar',
      'GET /api/prices?symbols=AAPL,MSFT — Yahoo Finance real-time prices',
    ],
    time: new Date().toISOString(),
  });
}
