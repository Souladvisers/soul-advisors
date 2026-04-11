export default async function handler(req, res) {
  const TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = process.env.GITHUB_OWNER || 'Souladvisers';
  const REPO  = process.env.GITHUB_REPO  || 'soul-advisors';

  const headers = {
    Authorization: `token ${TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
  };

  const dataRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/public/data.json`,
    { headers }
  );

  if (!dataRes.ok) return res.status(500).json({ error: 'Could not read data' });

  const dataFile = await dataRes.json();
  const data = JSON.parse(Buffer.from(dataFile.content, 'base64').toString('utf8'));

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json(data);
}
