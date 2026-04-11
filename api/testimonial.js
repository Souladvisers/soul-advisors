export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { subdomain, title, body, name, role } = req.body;

  if (!subdomain || !body || !name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = process.env.GITHUB_OWNER || 'Souladvisers';
  const REPO  = process.env.GITHUB_REPO  || 'soul-advisors';

  if (!TOKEN) return res.status(500).json({ error: 'Server not configured' });

  const headers = {
    Authorization: `token ${TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  // Fetch current data.json
  const dataRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/public/data.json`, { headers });
  if (!dataRes.ok) return res.status(500).json({ error: 'Could not read data' });
  const dataFile = await dataRes.json();
  const currentData = JSON.parse(Buffer.from(dataFile.content, 'base64').toString('utf8'));

  // Find member
  const memberIndex = currentData.members.findIndex(m => m.subdomain === subdomain);
  if (memberIndex === -1) return res.status(404).json({ error: 'Advisor not found' });

  // Add testimonial
  const newTestimonial = {
    title: (title || '').trim(),
    body: body.trim(),
    name: name.trim(),
    role: (role || '').trim(),
  };
  currentData.members[memberIndex].testimonials = [
    ...(currentData.members[memberIndex].testimonials || []),
    newTestimonial,
  ];

  // Save back to GitHub
  const updatedContent = Buffer.from(JSON.stringify(currentData, null, 2)).toString('base64');
  const saveRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/public/data.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `New testimonial for ${subdomain} from ${name}`,
      content: updatedContent,
      sha: dataFile.sha,
    }),
  });

  if (!saveRes.ok) return res.status(500).json({ error: 'Failed to save testimonial' });

  return res.status(200).json({ success: true });
}
