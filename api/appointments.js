const FILE_PATH = 'public/appointments-data.json';
const MEMBERS_PATH = 'public/data.json';
const TYPES = ['Review', 'Opening', 'Closing'];

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

async function saveGithubFile(path, data, sha, headers, message) {
  const { OWNER, REPO } = repoInfo();
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  return fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ message, content, sha }),
  });
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const headers = githubHeaders();
  if (!headers) return res.status(500).json({ error: 'Server not configured. Add GITHUB_TOKEN in Vercel settings.' });

  if (req.method === 'GET') {
    const file = await fetchGithubFile(FILE_PATH, headers);
    if (!file) return res.status(500).json({ error: 'Could not read appointments data' });

    const { adminSubdomain, adminPasswordHash } = req.query;
    const isAdmin = await verifyAdmin(adminSubdomain, adminPasswordHash, headers);

    const appointments = file.data.appointments
      .filter((a) => isAdmin || !a.private)
      .map((a) => {
        if (isAdmin) return a;
        const { clientName, notes, ...rest } = a;
        return rest;
      });
    return res.status(200).json({ appointments, isAdmin });
  }

  if (req.method === 'POST') {
    const { subdomain, passwordHash, date, time, type, clientName, notes } = req.body;
    if (!subdomain || !passwordHash || !date || !TYPES.includes(type)) {
      return res.status(400).json({ error: 'Missing or invalid fields' });
    }

    const membersFile = await fetchGithubFile(MEMBERS_PATH, headers);
    if (!membersFile) return res.status(500).json({ error: 'Could not verify agent' });
    const member = membersFile.data.members.find((m) => m.subdomain === subdomain);
    if (!member) return res.status(404).json({ error: 'Agent not found' });
    if (member.passwordHash !== passwordHash) return res.status(401).json({ error: 'Incorrect password' });

    const file = await fetchGithubFile(FILE_PATH, headers);
    if (!file) return res.status(500).json({ error: 'Could not read appointments data' });

    const appointment = {
      id: `${subdomain}-${Date.now()}`,
      subdomain,
      agentName: member.name,
      accent: member.accent || '#B8975A',
      date,
      time: time || '',
      type,
      clientName: (clientName || '').trim(),
      notes: (notes || '').trim(),
      createdAt: new Date().toISOString(),
      private: member.isAdmin === true,
    };
    file.data.appointments.push(appointment);

    const saveRes = await saveGithubFile(FILE_PATH, file.data, file.sha, headers, `Add appointment: ${subdomain} ${date} (${type})`);
    if (!saveRes.ok) {
      const err = await saveRes.json();
      return res.status(500).json({ error: 'Failed to save appointment', details: err.message });
    }
    return res.status(200).json({ success: true, appointment });
  }

  if (req.method === 'DELETE') {
    const { id, subdomain, passwordHash, adminSubdomain, adminPasswordHash } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing appointment id' });

    const file = await fetchGithubFile(FILE_PATH, headers);
    if (!file) return res.status(500).json({ error: 'Could not read appointments data' });

    const appointment = file.data.appointments.find((a) => a.id === id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    let authorized = false;
    if (adminSubdomain) {
      authorized = await verifyAdmin(adminSubdomain, adminPasswordHash, headers);
    } else if (subdomain === appointment.subdomain) {
      const membersFile = await fetchGithubFile(MEMBERS_PATH, headers);
      const member = membersFile?.data.members.find((m) => m.subdomain === subdomain);
      authorized = !!member && member.passwordHash === passwordHash;
    }
    if (!authorized) return res.status(401).json({ error: 'Not authorised to delete this appointment' });

    file.data.appointments = file.data.appointments.filter((a) => a.id !== id);
    const saveRes = await saveGithubFile(FILE_PATH, file.data, file.sha, headers, `Remove appointment: ${id}`);
    if (!saveRes.ok) {
      const err = await saveRes.json();
      return res.status(500).json({ error: 'Failed to delete appointment', details: err.message });
    }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
