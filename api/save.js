export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { subdomain, passwordHash, profileData, photoBase64 } = req.body;

  if (!subdomain || !passwordHash || !profileData) {
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

  // 2. Verify password
  const memberIndex = currentData.members.findIndex(m => m.subdomain === subdomain);
  if (memberIndex === -1) return res.status(404).json({ error: 'Member not found' });
  const member = currentData.members[memberIndex];
  if (member.passwordHash !== passwordHash) return res.status(401).json({ error: 'Incorrect password' });

  // 3. Upload photo if provided
  let photoUrl = profileData.photo || member.photo || '';
  if (photoBase64 && photoBase64.startsWith('data:image/')) {
    const match = photoBase64.match(/^data:image\/(\w+);base64,(.+)$/);
    if (match) {
      const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
      const content = match[2];
      const photoPath = `public/photos/${subdomain}.${ext}`;

      // Check if photo exists already (need its SHA to update)
      let photoSha;
      const existsRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${photoPath}`, { headers });
      if (existsRes.ok) {
        const existingFile = await existsRes.json();
        photoSha = existingFile.sha;
      }

      const uploadRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${photoPath}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: `Upload photo for ${subdomain}`,
          content,
          ...(photoSha ? { sha: photoSha } : {}),
        }),
      });

      if (uploadRes.ok) {
        photoUrl = `/photos/${subdomain}.${ext}`;
      }
    }
  }

  // 4. Merge profile update (preserve protected fields)
  const preserved = {
    id:           member.id,
    subdomain:    member.subdomain,
    isAdmin:      member.isAdmin,
    passwordHash: profileData.passwordHash || member.passwordHash,
  };
  currentData.members[memberIndex] = { ...member, ...profileData, ...preserved, photo: photoUrl };

  // 5. Write updated data.json back to GitHub
  const updatedContent = Buffer.from(JSON.stringify(currentData, null, 2)).toString('base64');
  const saveRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/public/data.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Update profile: ${subdomain}`,
      content: updatedContent,
      sha: dataFile.sha,
    }),
  });

  if (!saveRes.ok) {
    const err = await saveRes.json();
    return res.status(500).json({ error: 'Failed to save to GitHub', details: err.message });
  }

  return res.status(200).json({ success: true, photo: photoUrl });
}
