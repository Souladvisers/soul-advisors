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
  // Module 1 extended fields
  const { monthly, tenure, income, dependants, shariah, tier, tierLabel } = profile || {};
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

  const tierMap = {
    1: 'Tier 1 — Conservative (60% low-risk / 30% medium / 10% high)',
    2: 'Tier 2 — Balanced (30% low-risk / 40% medium / 30% high)',
    3: 'Tier 3 — Aggressive (10% low-risk / 20% medium / 70% high)',
    4: 'Tier 4 — Shariah-Compliant (Islamic screening required)',
  };
  const clientTierStr = tierMap[tier] || tierMap[2];
  const extProfile = [
    monthly    ? `Monthly premium: S$${monthly}` : null,
    tenure     ? `Policy tenure remaining: ${tenure} years` : null,
    income     ? `Monthly income: ${income}` : null,
    dependants ? `Dependants: ${dependants}` : null,
  ].filter(Boolean).join(' | ');

  const today = new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' });

  // ── Prompt ───────────────────────────────────────────────────────────────
  const prompt = `You are a senior ILP portfolio strategist at SOUL Advisors, a Prudential Singapore advisory firm. Today is ${today}.

## MODULE 1 — CLIENT PROFILE
Age: ${profile.age} | Goal: ${goalLabel} | Remaining Horizon: ${profile.horizon} years | Target: ${profile.targetRet}% p.a. | Risk Tolerance: ${profile.riskTol}
${extProfile ? extProfile + '\n' : ''}Client Tier: ${clientTierStr}
Shariah requirement: ${shariah === 'yes' ? 'YES — Shariah/Islamic-compliant funds only' : 'No'}

## PORTFOLIO PERFORMANCE SINCE INCEPTION
Total Invested: ${sgd(performance.totalInvested)} | Current Value: ${sgd(performance.totalCurrentValue)} | Gain/Loss: ${pf(performance.pctGain)} (${sgd(performance.absGain)}) | CAGR: ${performance.cagr != null ? pf(performance.cagr) : '—'} p.a. | Period: ${performance.years?.toFixed(1)} years

## CURRENT HOLDINGS (what the client holds today)
Format: Fund | CCY | Current Value | Allocation% | 1M% | 3M% | 1Y% | 3Ypa%
${holdingRows.join('\n')}

## MODULE 3 TARGET ALLOCATION (rule-based recommendation)
Format: Action | Fund | Current% → Target% | Amount
${tradeRows.join('\n')}

## ALL PRULINK FUND MARKET DATA — Live as of ${priceDate || today}
(Use 1M and 3M columns to read live market momentum)
${fundHeader}
${fundRows.join('\n')}

## YOUR TASK

STEP 1 — MODULE 1 PROFILE ASSESSMENT
Confirm the client tier classification (${clientTierStr}) is appropriate given their age, horizon, and risk profile. Note any misalignments.

STEP 2 — ASSESS THE CURRENT PORTFOLIO (Module 4 context)
Read the 1M and 3M performance of each fund the client CURRENTLY HOLDS:
- Which holdings show momentum strength? Which are under pressure?
- How does each holding compare to its peers in the full fund universe?

STEP 3 — MODULE 4: REBALANCING TRIGGER REVIEW
Apply each of these three rules to the proposed trades:
Rule 1 — Drift trigger: The system has already flagged funds drifting more than ±5% from target. Do you agree these should be acted on given current market conditions?
Rule 2 — Performance trigger: Flag any CURRENT holding that has underperformed its category peers by more than 10% over 1 year. These are candidates for replacement.
Rule 3 — Macro/manager trigger: Based on the 1M/3M fund data, are there macro headwinds (rate environment, geopolitical risk, currency pressure) affecting any current holding? Flag these.

Output a Rebalancing Verdict: "Rebalance Now" | "Monitor" | "No Action Required"

STEP 4 — REVIEW EACH PROPOSED TRADE
For each trade, assign priority: HIGH (do now — drift/perf/macro trigger), MEDIUM (do within 1-3 months), LOW (can wait).
Consider: should a sell be delayed (fund showing near-term strength)? Should a buy be accelerated (target fund has strong momentum)?

STEP 5 — MODULE 5: FUND SWAP CANDIDATES
For any holdings flagged for replacement in Step 3 Rule 2 or Rule 3:
- Identify 1-2 replacement candidates from the fund universe
- Evaluate: performance vs benchmark, risk profile match, Shariah compliance (if required), diversification impact, expense ratio
- Recommend the best swap with a one-sentence justification

STEP 6 — PHASING ADVICE
Should the client rebalance all at once or phase over months? Consider both market conditions and the client's tier/horizon.

Respond ONLY with a single valid JSON object (no markdown, no text outside the JSON):
{
  "tierAssessment": "1 sentence confirming or adjusting the client tier classification based on their profile",
  "marketContext": "2-3 sentences on how the current market (from 1M/3M data) specifically affects THIS client's current holdings — be concrete about which of their funds are benefiting or suffering",
  "portfolioAssessment": "2-3 sentences assessing portfolio strengths and weaknesses using fund names and recent momentum",
  "m4Verdict": "Rebalance Now | Monitor | No Action Required",
  "m4TriggersFound": ["e.g. Global Equity drifted +7% above target (Rule 1)", "Asia Fund underperformed peers by 12% over 1Y (Rule 2)"],
  "rebalancingUrgency": "immediate | gradual | wait",
  "urgencyReason": "one concise sentence explaining urgency based on market conditions and module 4 triggers",
  "adjustedTrades": [
    {
      "fund": "exact fund name as shown in Current Holdings or Rule-Based Recommendation",
      "action": "sell | buy | hold",
      "priority": "high | medium | low",
      "amount": 5000,
      "currentPct": 35.0,
      "targetPct": 25.0,
      "rationale": "1-2 sentences: which Module 4 rule triggered this and why the priority level"
    }
  ],
  "fundSwaps": [
    {
      "replaceFund": "fund being replaced (name)",
      "replacementFund": "recommended replacement (name from full fund list)",
      "triggerRule": "Rule 2 — underperformance | Rule 3 — macro headwind",
      "rationale": "1-2 sentences: why this swap, performance comparison, diversification impact"
    }
  ],
  "newOpportunities": [
    {
      "fund": "fund name from the full fund list (not currently held)",
      "suggestedPct": 10,
      "reason": "1 sentence: why add given current market and client tier"
    }
  ],
  "phasingAdvice": "Specific phasing advice referencing client tier and market conditions",
  "signals": [
    { "label": "short label", "detail": "one sentence", "direction": "bullish | bearish | neutral" }
  ],
  "risks": ["specific risk 1 for this rebalancing", "risk 2", "risk 3"],
  "advisorNote": "One natural sentence the advisor can use to open the rebalancing conversation with this specific client"
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
      tierAssessment:     result.tierAssessment     || '',
      marketContext:      result.marketContext      || '',
      portfolioAssessment:result.portfolioAssessment|| '',
      m4Verdict:          result.m4Verdict          || '',
      m4TriggersFound:    result.m4TriggersFound    || [],
      rebalancingUrgency: result.rebalancingUrgency || 'gradual',
      urgencyReason:      result.urgencyReason      || '',
      adjustedTrades:     result.adjustedTrades     || [],
      fundSwaps:          result.fundSwaps          || [],
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
