import { createEvent, deleteEvent, isConfigured } from './_googleCalendar.js';

const FILE_PATH = 'public/coaching-slots.json';
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const headers = githubHeaders();
  if (!headers) return res.status(500).json({ error: 'Server not configured. Add GITHUB_TOKEN in Vercel settings.' });

  if (req.method === 'GET') {
    const file = await fetchGithubFile(FILE_PATH, headers);
    if (!file) return res.status(500).json({ error: 'Could not read coaching slots' });
    return res.status(200).json({ slots: file.data.slots, calendarSynced: isConfigured() });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const action = req.body.action;

  // ── Coach opens a new slot ──────────────────────────────────────────────
  if (action === 'open') {
    const { adminSubdomain, adminPasswordHash, date, time, duration, notes } = req.body;
    if (!date || !time || !duration) return res.status(400).json({ error: 'Missing date, time or duration' });
    if (!(await verifyAdmin(adminSubdomain, adminPasswordHash, headers))) {
      return res.status(401).json({ error: 'Coach sign-in required' });
    }

    const file = await fetchGithubFile(FILE_PATH, headers);
    if (!file) return res.status(500).json({ error: 'Could not read coaching slots' });

    const slot = {
      id: `slot-${Date.now()}`,
      date, time,
      duration: Number(duration),
      notes: (notes || '').trim(),
      status: 'open',
      bookedBy: null,
      googleEventId: null,
      createdAt: new Date().toISOString(),
    };
    file.data.slots.push(slot);

    const saveRes = await saveGithubFile(FILE_PATH, file.data, file.sha, headers, `Open coaching slot: ${date} ${time}`);
    if (!saveRes.ok) {
      const err = await saveRes.json();
      return res.status(500).json({ error: 'Failed to save slot', details: err.message });
    }
    return res.status(200).json({ success: true, slot });
  }

  // ── Agent books an open slot ────────────────────────────────────────────
  if (action === 'book') {
    const { id, subdomain, passwordHash } = req.body;
    if (!id || !subdomain || !passwordHash) return res.status(400).json({ error: 'Missing required fields' });

    const membersFile = await fetchGithubFile(MEMBERS_PATH, headers);
    if (!membersFile) return res.status(500).json({ error: 'Could not verify agent' });
    const member = membersFile.data.members.find((m) => m.subdomain === subdomain);
    if (!member) return res.status(404).json({ error: 'Agent not found' });
    if (member.passwordHash !== passwordHash) return res.status(401).json({ error: 'Incorrect password' });

    const file = await fetchGithubFile(FILE_PATH, headers);
    if (!file) return res.status(500).json({ error: 'Could not read coaching slots' });

    const slot = file.data.slots.find((s) => s.id === id);
    if (!slot) return res.status(404).json({ error: 'Slot not found' });
    if (slot.status !== 'open') return res.status(409).json({ error: 'This slot has already been booked — please pick another.' });

    slot.status = 'booked';
    slot.bookedBy = { subdomain, name: member.name, accent: member.accent || '#B8975A', bookedAt: new Date().toISOString() };

    // Save the booking first — only sync to Google Calendar once it's committed,
    // so a race-lost booking never creates a phantom calendar event.
    const saveRes = await saveGithubFile(FILE_PATH, file.data, file.sha, headers, `Book coaching slot: ${subdomain} — ${slot.date} ${slot.time}`);
    if (!saveRes.ok) {
      if (saveRes.status === 409) {
        return res.status(409).json({ error: 'This slot was just booked by someone else — please refresh and pick another.' });
      }
      const err = await saveRes.json();
      return res.status(500).json({ error: 'Failed to save booking', details: err.message });
    }

    const eventId = await createEvent({
      summary: `Coaching: ${member.name}`,
      description: slot.notes || 'Booked via SOUL Advisors Team Calendar.',
      date: slot.date,
      time: slot.time,
      durationMinutes: slot.duration,
      attendeeEmail: member.email || undefined,
    });

    if (eventId) {
      slot.googleEventId = eventId;
      const refetch = await fetchGithubFile(FILE_PATH, headers);
      if (refetch) {
        const s2 = refetch.data.slots.find((s) => s.id === id);
        if (s2) s2.googleEventId = eventId;
        await saveGithubFile(FILE_PATH, refetch.data, refetch.sha, headers, `Link Google Calendar event: ${id}`);
      }
    }

    return res.status(200).json({ success: true, slot, calendarSynced: !!eventId });
  }

  // ── Cancel a booking (agent's own, or coach cancelling any) ─────────────
  if (action === 'cancel') {
    const { id, subdomain, passwordHash, adminSubdomain, adminPasswordHash } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing slot id' });

    const file = await fetchGithubFile(FILE_PATH, headers);
    if (!file) return res.status(500).json({ error: 'Could not read coaching slots' });
    const slot = file.data.slots.find((s) => s.id === id);
    if (!slot) return res.status(404).json({ error: 'Slot not found' });

    let authorized = false;
    if (adminSubdomain) {
      authorized = await verifyAdmin(adminSubdomain, adminPasswordHash, headers);
    } else if (subdomain && slot.bookedBy && slot.bookedBy.subdomain === subdomain) {
      const membersFile = await fetchGithubFile(MEMBERS_PATH, headers);
      const member = membersFile?.data.members.find((m) => m.subdomain === subdomain);
      authorized = !!member && member.passwordHash === passwordHash;
    }
    if (!authorized) return res.status(401).json({ error: 'Not authorised to cancel this booking' });

    const oldEventId = slot.googleEventId;
    slot.status = 'open';
    slot.bookedBy = null;
    slot.googleEventId = null;

    const saveRes = await saveGithubFile(FILE_PATH, file.data, file.sha, headers, `Cancel coaching booking: ${id}`);
    if (!saveRes.ok) {
      const err = await saveRes.json();
      return res.status(500).json({ error: 'Failed to cancel booking', details: err.message });
    }
    await deleteEvent(oldEventId);
    return res.status(200).json({ success: true });
  }

  // ── Coach removes a slot entirely ───────────────────────────────────────
  if (action === 'remove') {
    const { id, adminSubdomain, adminPasswordHash } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing slot id' });
    if (!(await verifyAdmin(adminSubdomain, adminPasswordHash, headers))) {
      return res.status(401).json({ error: 'Coach sign-in required' });
    }

    const file = await fetchGithubFile(FILE_PATH, headers);
    if (!file) return res.status(500).json({ error: 'Could not read coaching slots' });
    const slot = file.data.slots.find((s) => s.id === id);
    if (!slot) return res.status(404).json({ error: 'Slot not found' });

    file.data.slots = file.data.slots.filter((s) => s.id !== id);
    const saveRes = await saveGithubFile(FILE_PATH, file.data, file.sha, headers, `Remove coaching slot: ${id}`);
    if (!saveRes.ok) {
      const err = await saveRes.json();
      return res.status(500).json({ error: 'Failed to remove slot', details: err.message });
    }
    await deleteEvent(slot.googleEventId);
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
