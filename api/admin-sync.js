export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { adminHash, members } = req.body;

  if (!adminHash || !members || !Array.isArray(members)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = process.env.GITHUB_OWNER || 'Souladvisers';
  const REPO  = process.env.GITHUB_REPO  || 'soul-advisors';

  if (!TOKEN) return res.status(500).json({ error: 'Server not configured.' });

  const headers = {
    Authorization: `token ${TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  // Fetch current data.json for SHA + agency info
  const dataRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/public/data.json`, { headers });
  if (!dataRes.ok) return res.status(500).json({ error: 'Could not read data.json from GitHub' });
  const dataFile = await dataRes.json();
  const currentData = JSON.parse(Buffer.from(dataFile.content, 'base64').toString('utf8'));

  // Verify admin
  const admin = currentData.members.find(m => m.isAdmin && m.passwordHash === adminHash);
  if (!admin) return res.status(401).json({ error: 'Unauthorised' });

  // Sanitize subdomains & preserve profile-owned fields (photo, testimonials, passwordHash)
  // that the admin panel doesn't manage — never overwrite with empty values from the sync payload.
  const sanitized = members.map(m => {
    const subdomain = (m.subdomain || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const existing  = currentData.members.find(e => e.subdomain === subdomain) || {};
    return {
      ...m,
      subdomain,
      // Preserve large profile-owned fields if the incoming payload has none
      photo:        m.photo        || existing.photo        || '',
      testimonials: (m.testimonials && m.testimonials.length) ? m.testimonials : (existing.testimonials || []),
      passwordHash: m.passwordHash || existing.passwordHash || '',
    };
  });

  // Write all members back to GitHub, keeping agency info intact
  const updated = { ...currentData, members: sanitized };
  const updatedContent = Buffer.from(JSON.stringify(updated, null, 2)).toString('base64');

  const saveRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/public/data.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: 'Admin sync: push all members to GitHub',
      content: updatedContent,
      sha: dataFile.sha,
    }),
  });

  if (!saveRes.ok) {
    const err = await saveRes.json();
    return res.status(500).json({ error: 'Failed to save', details: err.message });
  }

  return res.status(200).json({ success: true, count: sanitized.length });
}
