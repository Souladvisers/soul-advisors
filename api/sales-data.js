export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method !== 'GET') return res.status(405).end();

  const TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = process.env.GITHUB_OWNER || 'Souladvisers';
  const REPO  = process.env.GITHUB_REPO  || 'soul-advisors';

  try {
    const r = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/public/sales-data.json`,
      { headers: { Authorization: `token ${TOKEN}`, Accept: 'application/vnd.github.v3+json' } }
    );
    if (!r.ok) return res.status(500).json({ error: 'Could not load sales data' });
    const file = await r.json();
    const data = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
