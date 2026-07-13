const FILE_PATH = 'public/inventory-data.json';
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
    const inventory = await fetchGithubFile(FILE_PATH, headers);
    if (!inventory) return res.status(500).json({ error: 'Could not read inventory data' });

    const { adminSubdomain, adminPasswordHash } = req.query;
    const isAdmin = await verifyAdmin(adminSubdomain, adminPasswordHash, headers);

    const agents = inventory.data.agents
      .filter((a) => isAdmin || !a.private)
      .map((a) => {
        if (isAdmin) return a;
        const { coachingLog, ...rest } = a;
        return rest;
      });
    return res.status(200).json({ agents, isAdmin });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (req.body.type === 'coaching') {
    const { targetSubdomain, adminSubdomain, adminPasswordHash, note, actionItem, nextCheckIn } = req.body;
    if (!targetSubdomain || !note) return res.status(400).json({ error: 'Missing required fields' });

    const isAdmin = await verifyAdmin(adminSubdomain, adminPasswordHash, headers);
    if (!isAdmin) return res.status(401).json({ error: 'Coach sign-in required' });

    const inventoryFile = await fetchGithubFile(FILE_PATH, headers);
    if (!inventoryFile) return res.status(500).json({ error: 'Could not read inventory data' });

    const inventory = inventoryFile.data;
    const agent = inventory.agents.find((a) => a.subdomain === targetSubdomain);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const entry = {
      timestamp: new Date().toISOString(),
      note: note.trim(),
      actionItem: (actionItem || '').trim(),
      nextCheckIn: nextCheckIn || null,
    };
    agent.coachingLog = [...(agent.coachingLog || []), entry];

    const { OWNER, REPO } = repoInfo();
    const updatedContent = Buffer.from(JSON.stringify(inventory, null, 2)).toString('base64');
    const saveRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `Coaching note: ${targetSubdomain}`,
        content: updatedContent,
        sha: inventoryFile.sha,
      }),
    });

    if (!saveRes.ok) {
      const err = await saveRes.json();
      return res.status(500).json({ error: 'Failed to save coaching note', details: err.message });
    }
    return res.status(200).json({ success: true, coachingLog: agent.coachingLog });
  }

  const { subdomain, passwordHash, casesOpen, premium, status, notes } = req.body;
  if (!subdomain || !passwordHash || casesOpen === undefined || premium === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const membersFile = await fetchGithubFile(MEMBERS_PATH, headers);
  if (!membersFile) return res.status(500).json({ error: 'Could not verify agent' });
  const member = membersFile.data.members.find((m) => m.subdomain === subdomain);
  if (!member) return res.status(404).json({ error: 'Agent not found' });
  if (member.passwordHash !== passwordHash) return res.status(401).json({ error: 'Incorrect password' });

  const inventoryFile = await fetchGithubFile(FILE_PATH, headers);
  if (!inventoryFile) return res.status(500).json({ error: 'Could not read inventory data' });

  const inventory = inventoryFile.data;
  let agent = inventory.agents.find((a) => a.subdomain === subdomain);
  if (!agent) {
    agent = { subdomain, name: member.name, accent: member.accent || '#B8975A', history: [], coachingLog: [] };
    inventory.agents.push(agent);
  }

  const timestamp = new Date().toISOString();
  agent.name = member.name;
  agent.casesOpen = Number(casesOpen);
  agent.premium = Number(premium);
  agent.status = status || 'On Track';
  agent.notes = (notes || '').trim();
  agent.updatedAt = timestamp;
  agent.history = [
    ...(agent.history || []),
    { casesOpen: agent.casesOpen, premium: agent.premium, status: agent.status, notes: agent.notes, timestamp },
  ];

  const { OWNER, REPO } = repoInfo();
  const updatedContent = Buffer.from(JSON.stringify(inventory, null, 2)).toString('base64');
  const saveRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Update inventory: ${subdomain} (${agent.casesOpen} cases, $${agent.premium} premium)`,
      content: updatedContent,
      sha: inventoryFile.sha,
    }),
  });

  if (!saveRes.ok) {
    const err = await saveRes.json();
    return res.status(500).json({ error: 'Failed to save inventory', details: err.message });
  }

  return res.status(200).json({ success: true, agent });
}
