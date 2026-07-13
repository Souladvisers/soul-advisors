const FILE_PATH = 'public/targets-data.json';
const MEMBERS_PATH = 'public/data.json';

function githubHeaders() {
  const TOKEN = process.env.GITHUB_TOKEN;
  if (!TOKEN) return null;
  return {
    Authorization: `token ${TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

function repoInfo() {
  return {
    OWNER: process.env.GITHUB_OWNER || 'Souladvisers',
    REPO: process.env.GITHUB_REPO || 'soul-advisors',
  };
}

async function fetchGithubFile(path, headers) {
  const { OWNER, REPO } = repoInfo();
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, { headers });
  if (!res.ok) return null;
  const file = await res.json();
  const data = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
  return { data, sha: file.sha };
}

async function verifyAdmin(subdomain, passwordHash, headers) {
  if (!subdomain || !passwordHash) return false;
  const membersFile = await fetchGithubFile(MEMBERS_PATH, headers);
  if (!membersFile) return false;
  const member = membersFile.data.members.find((m) => m.subdomain === subdomain);
  return !!member && member.isAdmin === true && member.passwordHash === passwordHash;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const headers = githubHeaders();
  if (!headers) return res.status(500).json({ error: 'Server not configured. Add GITHUB_TOKEN in Vercel settings.' });

  if (req.method === 'GET') {
    const file = await fetchGithubFile(FILE_PATH, headers);
    if (!file) return res.status(500).json({ error: 'Could not read target data' });

    const { adminSubdomain, adminPasswordHash } = req.query;
    const isAdmin = await verifyAdmin(adminSubdomain, adminPasswordHash, headers);

    const targets = file.data.targets.filter((t) => isAdmin || !t.private);
    return res.status(200).json({ targets, isAdmin });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { subdomain, passwordHash, annualTarget, ytdProduction, ytdCases, ytdClients } = req.body;
  if (!subdomain || !passwordHash || annualTarget === undefined || ytdProduction === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const membersFile = await fetchGithubFile(MEMBERS_PATH, headers);
  if (!membersFile) return res.status(500).json({ error: 'Could not verify agent' });
  const member = membersFile.data.members.find((m) => m.subdomain === subdomain);
  if (!member) return res.status(404).json({ error: 'Agent not found' });
  if (member.passwordHash !== passwordHash) return res.status(401).json({ error: 'Incorrect password' });

  const file = await fetchGithubFile(FILE_PATH, headers);
  if (!file) return res.status(500).json({ error: 'Could not read target data' });

  const targetsData = file.data;
  let target = targetsData.targets.find((t) => t.subdomain === subdomain);
  if (!target) {
    target = { subdomain, name: member.name, accent: member.accent || '#B8975A', history: [], private: member.isAdmin === true };
    targetsData.targets.push(target);
  }

  const timestamp = new Date().toISOString();
  target.name = member.name;
  target.annualTarget = Number(annualTarget);
  target.ytdProduction = Number(ytdProduction);
  target.ytdCases = Number(ytdCases) || 0;
  target.ytdClients = Number(ytdClients) || 0;
  target.updatedAt = timestamp;
  target.history = [
    ...(target.history || []),
    { annualTarget: target.annualTarget, ytdProduction: target.ytdProduction, ytdCases: target.ytdCases, ytdClients: target.ytdClients, timestamp },
  ];

  const { OWNER, REPO } = repoInfo();
  const updatedContent = Buffer.from(JSON.stringify(targetsData, null, 2)).toString('base64');
  const saveRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Update target: ${subdomain} (S$${target.ytdProduction} / S$${target.annualTarget})`,
      content: updatedContent,
      sha: file.sha,
    }),
  });

  if (!saveRes.ok) {
    const err = await saveRes.json();
    return res.status(500).json({ error: 'Failed to save target', details: err.message });
  }

  return res.status(200).json({ success: true, target });
}
