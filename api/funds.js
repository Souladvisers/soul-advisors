const { readFileSync } = require('fs');
const { join }         = require('path');

module.exports = async function handler(req, res) {
  // CORS — open for AI agents and external consumers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Try multiple locations — Vercel CWD varies by environment
    let raw;
    const candidates = [
      join(process.cwd(), 'public', 'prulink-data.json'),
      join(__dirname, '..', 'public', 'prulink-data.json'),
      join('/var/task', 'public', 'prulink-data.json'),
    ];
    for (const p of candidates) {
      try { raw = readFileSync(p, 'utf8'); break; } catch (_) {}
    }
    if (!raw) return res.status(500).json({ error: 'Data file not found', tried: candidates });

    let data  = JSON.parse(raw);
    let funds = data.funds;

    const { asset, risk, distribution, currency, search, sort, order } = req.query;

    // ── Filters ──────────────────────────────────────────────────────────────
    if (asset)        funds = funds.filter(f => f.assetClass?.toLowerCase().includes(asset.toLowerCase()));
    if (risk)         funds = funds.filter(f => f.risk?.toLowerCase().startsWith(risk.toLowerCase()));
    if (distribution) funds = funds.filter(f => f.isDistribution === (distribution === 'true' || distribution === '1'));
    if (currency)     funds = funds.filter(f => f.currency?.toUpperCase() === currency.toUpperCase());
    if (search) {
      const q = search.toLowerCase();
      funds = funds.filter(f =>
        f.name?.toLowerCase().includes(q)       ||
        f.assetClass?.toLowerCase().includes(q) ||
        f.region?.toLowerCase().includes(q)     ||
        f.manager?.toLowerCase().includes(q)    ||
        f.strategy?.toLowerCase().includes(q)
      );
    }

    // ── Sort ─────────────────────────────────────────────────────────────────
    const sortKey = sort  || '1y';
    const sortDir = (order || 'desc').toLowerCase();
    const perfMap = { '1m':'1m','3m':'3m','6m':'6m','1y':'1y','3y':'3y','5y':'5y','10y':'10y','si':'si' };

    funds.sort((a, b) => {
      let va, vb;
      if (perfMap[sortKey]) {
        va = a.performance[perfMap[sortKey]] ?? -9999;
        vb = b.performance[perfMap[sortKey]] ?? -9999;
      } else if (sortKey === 'aum') {
        va = a.aum ?? 0; vb = b.aum ?? 0;
      } else {
        va = (a[sortKey] || '').toLowerCase();
        vb = (b[sortKey] || '').toLowerCase();
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });

    // ── Response ─────────────────────────────────────────────────────────────
    return res.status(200).json({
      meta: {
        ...data.meta,
        filtered: funds.length,
        filters: { asset, risk, distribution, currency, search, sort: sortKey, order: sortDir },
        endpoints: {
          all:           '/api/funds',
          distribution:  '/api/funds?distribution=true',
          byAsset:       '/api/funds?asset=Equity',
          byRisk:        '/api/funds?risk=Higher+Risk',
          byCurrency:    '/api/funds?currency=SGD',
          search:        '/api/funds?search=global',
          topPerformers: '/api/funds?sort=1y&order=desc',
          dashboard:     '/funds'
        }
      },
      funds
    });

  } catch (err) {
    console.error('funds API error:', err);
    return res.status(500).json({ error: 'Failed to load fund data', detail: err.message });
  }
};
