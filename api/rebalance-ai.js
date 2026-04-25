// api/rebalance-ai.js
// AI-enhanced rebalancing analysis: sends current portfolio + rule-based trades
// to Claude, which reads live market momentum from fund 1M/3M data and returns
// market-aware, prioritised rebalancing advice.
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
      error: 'AI service not configured. Please add ANTHROPIC_API_KEY to Vercel environment variables.',
    });
  }

  const { profile, currentHoldings, trades, performance, funds, priceDate } = req.body || {};
  if (!profile || !currentHoldings?.length || !funds?.length) {
    return res.status(400).json({ error: 'Missing required data.' });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  const pf   = v => v != null ? (v * 100).toFixed(1) : '—';
  const sgd  = v => 'S$' + Math.abs(v || 0).toLocaleString('en-SG', { maximumFractionDigits: 0 });
  const strip = n => (n || '').replace(/PRULink |PruLink /g, '');
  const rn   = r => {
    const s = (r || '').toLowerCase();
    if (s.startsWith('lower risk'))    return 1;
    if (s.startsWith('lower to') || s.startsWith('low to')) return 2;
    if (s.startsWith('medium to'))    return 3;
    if (s.startsWith('higher'))       return 4;
    return 3;
  };

  // ── Current portfolio table ──────────────────────────────────────────────
  const holdingRows = currentHoldings.map(h => {
    const p = h.fund?.performance || {};
    return [
      strip(h.name || h.fund?.name || ''),
      h.fund?.currency || 'SGD',
      sgd(h.value),
      h.pct?.toFixed(1) + '%',
      pf(p['1m']), pf(p['3m']), pf(p['1y']), pf(p['3y']),
    ].join(' | ');
  });

  // ── Rule-based trades table ──────────────────────────────────────────────
  const tradeRows = trades.map(t => [
    t.action.toUpperCase(),
    strip(t.fund?.name || ''),
    t.curPct?.toFixed(1) + '% → ' + t.targetPct?.toFixed(1) + '%',
    (t.action === 'sell' ? '-' : t.action === 'buy' ? '+' : '') + sgd(t.amount),
  ].join(' | '));

  // ── All funds compact (market data) ─────────────────────────────────────
  const fundHeader = 'Fund | CCY | Class | Risk | 1M% | 3M% | 1Y% | 3Ypa%';
  const fundRows = funds.map(f => {
    const p = f.performance || {};
    return [strip(f.name), f.currency, f.assetClass, rn(f.risk),
      pf(p['1m']), pf(p['3m']), pf(p['1y']), pf(p['3y'])].join(' | ');
  });

  const goalLabel = {
    retirement: 'Retirement Planning', growth: 'Wealth Accumulation',
    education: 'Education Fund', income: 'Regular Income', preservation: 'Capital Preservation',
  }[profile.goal] || profile.goal;

  const today = new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' });

  // ── Prompt ───────────────────────────────────────────────────────────────
  const prompt = `You are a senior portfolio strategist at SOUL Advisors, a Prudential Singapore ILP advisory firm. Today is ${today}.

## CLIENT PROFILE
Age: ${profile.age} | Goal: ${goalLabel} | Remaining Horizon: ${profile.horizon} years | Target: ${profile.targetRet}% p.a. | Risk Tolerance: ${profile.riskTol}

## PORTFOLIO PERFORMANCE SINCE INCEPTION
Total Invested: ${sgd(performance.totalInvested)} | Current Value: ${sgd(performance.totalCurrentValue)} | Gain/Loss: ${pf(performance.pctGain)} (${sgd(performance.absGain)}) | CAGR: ${performance.cagr != null ? pf(performance.cagr) : '—'} p.a. | Period: ${performance.years?.toFixed(1)} years

## CURRENT HOLDINGS (what the client holds today)
Format: Fund | CCY | Current Value | Allocation% | 1M% | 3M% | 1Y% | 3Ypa%
${holdingRows.join('\n')}

## RULE-BASED REBALANCING RECOMMENDATION (from system)
Format: Action | Fund | Current% → Target% | Amount
${tradeRows.join('\n')}

## ALL PRULINK FUND MARKET DATA — Live as of ${priceDate || today}
(Use 1M and 3M columns to read live market momentum)
${fundHeader}
${fundRows.join('\n')}

## YOUR TASK

STEP 1 — ASSESS THE CURRENT PORTFOLIO
Read the 1M and 3M performance of each fund the client CURRENTLY HOLDS:
- Which of their holdings are showing strength right now?
- Which are lagging or under pressure?
- How does the portfolio's recent performance compare to the overall PRULink fund universe?

STEP 2 — ASSESS THE MARKET BROADLY
From the full fund data, identify:
- What asset classes / regions are currently in favour?
- What is the overall market direction (risk-on / risk-off)?
- Any tactical opportunities the rule-based system may have missed?

STEP 3 — REVIEW EACH PROPOSED TRADE
For each rule-based trade, consider:
- Is this the right time to execute given current market momentum?
- Should any sell be delayed because the fund is currently performing well?
- Should any buy be prioritised because the target fund has strong momentum?
- Assign each trade a priority: HIGH (do now), MEDIUM (do within 1-3 months), LOW (can wait or reconsider)

STEP 4 — PHASING ADVICE
Should the client rebalance all at once, or phase it over time? Why?

Respond ONLY with a single valid JSON object (no markdown, no text outside the JSON):
{
  "marketContext": "2-3 sentences on how the current market (from 1M/3M data) specifically affects THIS client's current holdings — be concrete about which of their funds are benefiting or suffering",
  "portfolioAssessment": "2-3 sentences assessing the portfolio's current strengths and weaknesses — reference actual fund names and their recent momentum",
  "rebalancingUrgency": "immediate | gradual | wait",
  "urgencyReason": "one concise sentence explaining the urgency level based on market conditions and portfolio drift",
  "adjustedTrades": [
    {
      "fund": "exact fund name as shown in Current Holdings or Rule-Based Recommendation",
      "action": "sell | buy | hold",
      "priority": "high | medium | low",
      "amount": 5000,
      "currentPct": 35.0,
      "targetPct": 25.0,
      "rationale": "1-2 sentences: market-aware reason for this trade and its priority level"
    }
  ],
  "newOpportunities": [
    {
      "fund": "fund name from the full fund list (not currently held)",
      "suggestedPct": 10,
      "reason": "1 sentence: why add this fund given current market conditions and client profile"
    }
  ],
  "phasingAdvice": "Specific advice: do all at once or phase over X months and why",
  "signals": [
    { "label": "short label", "detail": "one sentence", "direction": "bullish | bearish | neutral" }
  ],
  "risks": ["specific risk 1 for this rebalancing", "risk 2", "risk 3"],
  "advisorNote": "One natural sentence the advisor can say to open the rebalancing conversation with this specific client"
}`;

  // ── Call Claude ───────────────────────────────────────────────────────────
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
        max_tokens: 2800,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!apiRes.ok) {
      const errBody = await apiRes.json().catch(() => ({}));
      return res.status(502).json({
        error: `AI API error ${apiRes.status}: ${errBody?.error?.message || 'Unknown'}`,
      });
    }

    const data    = await apiRes.json();
    const rawText = (data.content?.[0]?.text || '').trim();
    const jsonStr = rawText.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();

    let result;
    try { result = JSON.parse(jsonStr); }
    catch (e) {
      console.error('JSON parse error:', e, rawText.substring(0, 300));
      return res.status(502).json({ error: 'AI returned unexpected format. Please try again.' });
    }

    return res.status(200).json({
      success:            true,
      marketContext:      result.marketContext      || '',
      portfolioAssessment:result.portfolioAssessment|| '',
      rebalancingUrgency: result.rebalancingUrgency || 'gradual',
      urgencyReason:      result.urgencyReason      || '',
      adjustedTrades:     result.adjustedTrades     || [],
      newOpportunities:   result.newOpportunities   || [],
      phasingAdvice:      result.phasingAdvice      || '',
      signals:            result.signals            || [],
      risks:              result.risks              || [],
      advisorNote:        result.advisorNote        || '',
      tokensUsed:         (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    });

  } catch (e) {
    console.error('rebalance-ai error:', e);
    return res.status(500).json({ error: e.message || 'AI analysis failed. Please try again.' });
  }
};
