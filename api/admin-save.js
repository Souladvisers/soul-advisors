export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { adminHash, action, memberData, memberId } = req.body;

  if (!adminHash || !action) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = process.env.GITHUB_OWNER || 'Souladvisers';
  const REPO  = process.env.GITHUB_REPO  || 'soul-advisors';

  if (!TOKEN) return res.status(500).json({ error: 'Server not configured. Add GITHUB_TOKEN in Vercel settings.' });

  const headers = {
    Authorization: `token ${TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  // 1. Fetch current data.json
  const dataRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/public/data.json`, { headers });
  if (!dataRes.ok) return res.status(500).json({ error: 'Could not read data.json from GitHub' });
  const dataFile = await dataRes.json();
  const currentData = JSON.parse(Buffer.from(dataFile.content, 'base64').toString('utf8'));

  // 2. Verify admin password
  const admin = currentData.members.find(m => m.isAdmin && m.passwordHash === adminHash);
  if (!admin) return res.status(401).json({ error: 'Unauthorised — admin credentials required' });

  // 3. Perform action
  if (action === 'add') {
    // Check subdomain not already taken
    if (currentData.members.find(m => m.subdomain === memberData.subdomain)) {
      return res.status(409).json({ error: 'Subdomain already in use' });
    }
    const newMember = {
      id: 'member_' + Date.now(),
      bio: '',
      credentials: [],
      specialisations: [],
      testimonials: [],
      yearsExperience: '',
      photo: '',
      isAdmin: false,
      whatsapp: (memberData.phone || '').replace(/\D/g, ''),
      ...memberData,
    };
    currentData.members.push(newMember);

  } else if (action === 'update') {
    const idx = currentData.members.findIndex(m => m.id === memberId);
    if (idx === -1) return res.status(404).json({ error: 'Member not found' });
    const existing = currentData.members[idx];
    // Preserve protected fields
    const protected_ = { id: existing.id, isAdmin: existing.isAdmin, testimonials: existing.testimonials, photo: existing.photo };
    currentData.members[idx] = { ...existing, ...memberData, ...protected_ };
    if (memberData.phone) currentData.members[idx].whatsapp = memberData.phone.replace(/\D/g, '');

  } else if (action === 'delete') {
    const idx = currentData.members.findIndex(m => m.id === memberId);
    if (idx === -1) return res.status(404).json({ error: 'Member not found' });
    if (currentData.members[idx].isAdmin) return res.status(403).json({ error: 'Cannot delete admin' });
    currentData.members.splice(idx, 1);

  } else {
    return res.status(400).json({ error: 'Unknown action' });
  }

  // 4. Write back to GitHub
  const updatedContent = Buffer.from(JSON.stringify(currentData, null, 2)).toString('base64');
  const saveRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/public/data.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Admin ${action} member`,
      content: updatedContent,
      sha: dataFile.sha,
    }),
  });

  if (!saveRes.ok) {
    const err = await saveRes.json();
    return res.status(500).json({ error: 'Failed to save to GitHub', details: err.message });
  }

  return res.status(200).json({ success: true });
}
