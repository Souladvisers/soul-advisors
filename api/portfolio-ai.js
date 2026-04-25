// api/portfolio-ai.js
// Calls Claude to analyse current market conditions (inferred from live PRULink
// fund 1M/3M returns) and return an AI-enhanced portfolio allocation.
// Requires: ANTHROPIC_API_KEY in Vercel environment variables.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) {
    return res.status(503).json({
      error: 'AI service not configured. Please add ANTHROPIC_API_KEY to your Vercel environment variables.',
    });
  }

  const { profile, funds, priceDate } = req.body || {};
  if (!profile || !Array.isArray(funds) || !funds.length) {
    return res.status(400).json({ error: 'Missing profile or funds data.' });
  }

  // ── Build compact fund table (minimise tokens) ──────────────────────────
  const rn = r => {
    const s = (r || '').toLowerCase();
    if (s.startsWith('lower risk'))            return 1;
    if (s.startsWith('lower to') || s.startsWith('low to')) return 2;
    if (s.startsWith('medium to'))             return 3;
    if (s.startsWith('higher'))                return 4;
    return 3;
  };
  const pf = v => v != null ? (v * 100).toFixed(1) : '—';
  const strip = n => (n || '').replace(/PRULink |PruLink /g, '');

  const header = 'Fund | CCY | Class | Risk | 1M% | 3M% | 1Y% | 3Ypa% | 5Ypa% | Dist | AUM_M';
  const rows = funds.map(f => {
    const p = f.performance || {};
    return [
      strip(f.name),
      f.currency,
      f.assetClass,
      rn(f.risk),
      pf(p['1m']), pf(p['3m']), pf(p['1y']), pf(p['3y']), pf(p['5y']),
      f.isDistribution ? 'Y' : 'N',
      f.aum || '—',
    ].join(' | ');
  });

  const today = new Date().toLocaleDateString('en-SG', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const goalLabel = {
    retirement: 'Retirement Planning',
    growth:     'Wealth Accumulation',
    education:  'Education Fund',
    income:     'Regular Income',
    preservation: 'Capital Preservation',
  }[profile.goal] || profile.goal;

  // ── Prompt ──────────────────────────────────────────────────────────────
  const prompt = `You are a senior portfolio strategist at SOUL Advisors, a Prudential Singapore ILP advisory firm. Today is ${today}.

## CLIENT PROFILE
Age: ${profile.age} | Goal: ${goalLabel} | Horizon: ${profile.horizon} years | Target: ${profile.targetRet}% p.a. | Risk Tolerance: ${profile.riskTol} | Currency preference: ${profile.ccy || 'No preference'}

## PRULINK FUND DATA — Live as of ${priceDate || today}
(1M and 3M columns are LIVE market data — use them to read current market momentum)

${header}
${rows.join('\n')}

## YOUR TASK

STEP 1 — READ THE MARKET from the 1M and 3M columns above (this is live data).
- Identify which asset classes / regions are trending up vs down right now
- Is the market risk-on (equities leading) or risk-off (bonds / cash outperforming)?
- Any notable divergences: EM vs developed, Asia vs global, growth vs income?
- What does the 1Y vs 3M spread tell you about recent momentum shifts?

STEP 2 — BUILD THE PORTFOLIO for this specific client.
- Weight allocations to reflect BOTH the client profile AND current market signals
- Tactically overweight areas with positive momentum if suitable for the client's horizon
- Avoid areas under near-term pressure unless they fit a contrarian long-term case
- Select 5–7 funds. Allocations must total exactly 100.

STEP 3 — EXPLAIN clearly: each fund reason should connect the current market observation to the client's goal.

Respond ONLY with a single valid JSON object (no markdown, no text outside the JSON):
{
  "marketSummary": "3-4 sentences: what the live 1M/3M data tells you about current market conditions — be specific about which regions/classes are moving and why it matters for this client",
  "signals": [
    { "label": "short label e.g. Asian equity momentum", "detail": "one sentence", "direction": "bullish" },
    { "label": "...", "detail": "...", "direction": "bearish" },
    { "label": "...", "detail": "...", "direction": "neutral" }
  ],
  "riskScore": 3,
  "riskLabel": "Moderate",
  "allocation": [
    {
      "name": "exact fund name as shown in the Fund column above",
      "pct": 25,
      "bucket": "fixed | multi | eq_dev | eq_em | eq_spec",
      "reason": "1-2 sentences linking current market momentum AND client goal to this specific fund"
    }
  ],
  "risks": [
    "Specific risk 1 relevant to this portfolio and market environment",
    "Specific risk 2",
    "Specific risk 3"
  ],
  "advisorNote": "One sentence the advisor can use to open the conversation with this client about this portfolio"
}`;

  // ── Call Claude API ──────────────────────────────────────────────────────
  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!apiRes.ok) {
      const errBody = await apiRes.json().catch(() => ({}));
      console.error('Anthropic API error:', apiRes.status, errBody);
      return res.status(502).json({
        error: `AI API returned ${apiRes.status}: ${errBody?.error?.message || 'Unknown error'}`,
      });
    }

    const data   = await apiRes.json();
    const rawText = (data.content?.[0]?.text || '').trim();

    // Strip markdown code fences if present
    const jsonStr = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/,       '')
      .replace(/\s*```$/,       '')
      .trim();

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, '\nRaw:', rawText.substring(0, 300));
      return res.status(502).json({ error: 'AI returned unexpected format. Please try again.' });
    }

    // Normalise allocation to exactly 100%
    const alloc = result.allocation || [];
    const total = alloc.reduce((s, x) => s + (Number(x.pct) || 0), 0);
    if (total > 0 && Math.abs(total - 100) > 1) {
      alloc.forEach(x => { x.pct = Math.round((Number(x.pct) / total) * 100); });
      // Fix rounding diff on largest item
      const diff = 100 - alloc.reduce((s, x) => s + x.pct, 0);
      if (diff) alloc.sort((a, b) => b.pct - a.pct)[0].pct += diff;
    }

    return res.status(200).json({
      success:      true,
      marketSummary: result.marketSummary || '',
      signals:      result.signals       || [],
      riskScore:    result.riskScore     || 3,
      riskLabel:    result.riskLabel     || 'Moderate',
      allocation:   alloc,
      risks:        result.risks         || [],
      advisorNote:  result.advisorNote   || '',
      tokensUsed:   (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    });

  } catch (e) {
    console.error('portfolio-ai handler error:', e);
    return res.status(500).json({ error: e.message || 'AI analysis failed. Please try again.' });
  }
};
