// Shared Google Calendar helper for coaching-slots.js.
// Files prefixed with "_" are ignored by Vercel's automatic API routing.
//
// Requires these Vercel env vars (see docs/google-calendar-setup.md):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
// Optional: GOOGLE_CALENDAR_ID (defaults to "primary")
//
// If the env vars aren't set, every function here is a no-op that returns
// null — booking still works on the website, it just won't appear on the
// coach's Google Calendar until the credentials are configured.

function isConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
}

async function getAccessToken() {
  if (!isConfigured()) return null;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    console.error('Google token refresh failed:', await res.text());
    return null;
  }
  const data = await res.json();
  return data.access_token || null;
}

async function createEvent({ summary, description, date, time, durationMinutes, attendeeEmail }) {
  if (!isConfigured()) return null;
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  const start = new Date(`${date}T${time || '09:00'}:00+08:00`);
  const end = new Date(start.getTime() + (durationMinutes || 30) * 60000);

  const body = {
    summary,
    description: description || '',
    start: { dateTime: start.toISOString(), timeZone: 'Asia/Singapore' },
    end: { dateTime: end.toISOString(), timeZone: 'Asia/Singapore' },
  };
  if (attendeeEmail) body.attendees = [{ email: attendeeEmail }];

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    console.error('Google Calendar event creation failed:', await res.text());
    return null;
  }
  const created = await res.json();
  return created.id || null;
}

async function deleteEvent(eventId) {
  if (!isConfigured() || !eventId) return;
  const accessToken = await getAccessToken();
  if (!accessToken) return;

  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=all`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
  ).catch((err) => console.error('Google Calendar event deletion failed:', err));
}

export { isConfigured, createEvent, deleteEvent };
