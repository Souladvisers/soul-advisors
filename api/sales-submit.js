export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { agentHash, agentName, month, week, values } = req.body;
  // values = [dialled, reached, made, fixed, seen, np, co, ca, cc, cold, ref, bo, bc]

  if (!agentHash || !agentName || !month || !week || !Array.isArray(values) || values.length !== 13) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  const TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = process.env.GITHUB_OWNER || 'Souladvisers';
  const REPO  = process.env.GITHUB_REPO  || 'soul-advisors';
  const headers = {
    Authorization: `token ${TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  // Verify agent is a valid member
  const profileRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/public/data.json`, { headers });
  if (!profileRes.ok) return res.status(500).json({ error: 'Could not verify agent' });
  const profileFile = await profileRes.json();
  const profileData = JSON.parse(Buffer.from(profileFile.content, 'base64').toString('utf8'));
  const agent = profileData.members.find(m => m.passwordHash === agentHash);
  if (!agent) return res.status(401).json({ error: 'Unauthorised' });

  // Load sales-data.json
  const salesRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/public/sales-data.json`, { headers });
  if (!salesRes.ok) return res.status(500).json({ error: 'Could not load sales data' });
  const salesFile = await salesRes.json();
  const salesData = JSON.parse(Buffer.from(salesFile.content, 'base64').toString('utf8'));

  // Update the specific agent/month/week
  const name = agentName.toUpperCase();
  if (!salesData.submissions[month]) salesData.submissions[month] = {};
  if (!salesData.submissions[month][name]) salesData.submissions[month][name] = { w1:[0,0,0,0,0,0,0,0,0,0,0,0,0], w2:[0,0,0,0,0,0,0,0,0,0,0,0,0], w3:[0,0,0,0,0,0,0,0,0,0,0,0,0], w4:[0,0,0,0,0,0,0,0,0,0,0,0,0] };
  salesData.submissions[month][name][week] = values.map(v => Number(v) || 0);

  // Write back
  const updated = Buffer.from(JSON.stringify(salesData, null, 2)).toString('base64');
  const saveRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/public/sales-data.json`, {
    method: 'PUT', headers,
    body: JSON.stringify({ message: `Sales submit: ${name} ${month} ${week}`, content: updated, sha: salesFile.sha }),
  });
  if (!saveRes.ok) {
    const err = await saveRes.json();
    return res.status(500).json({ error: 'Save failed', details: err.message });
  }
  res.status(200).json({ success: true });
}
