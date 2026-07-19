# Google Calendar sync setup

When an agent books a coaching slot, the site will create a real event on your Google Calendar (`pru.aarief@gmail.com`) — but only once these three secrets are added to Vercel. Until then, booking still works normally on the website; it just won't appear on your calendar.

This is a one-time, ~10 minute setup. It has to be done by you, in your own browser, because it involves you personally authorizing access to your Google account — it's not something that can be done on your behalf.

## 1. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/), signed in as `pru.aarief@gmail.com`.
2. Create a new project (any name, e.g. "SOUL Advisors Calendar").

## 2. Enable the Calendar API

1. In the left menu: **APIs & Services → Library**.
2. Search for **Google Calendar API** and click **Enable**.

## 3. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External**.
3. Fill in app name (e.g. "SOUL Advisors Booking"), your email as support email.
4. Add scope: `https://www.googleapis.com/auth/calendar.events`.
5. Under **Test users**, add `pru.aarief@gmail.com`.
6. Save. Leave the app in "Testing" status for now — see the note at the bottom about publishing later.

## 4. Create OAuth credentials

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Desktop app**.
3. Name it anything, e.g. "SOUL Advisors Server".
4. Save the **Client ID** and **Client Secret** it gives you — you'll need both below.

## 5. Get a refresh token (via Google's OAuth Playground)

This is the trickiest step, but no coding is required.

1. Go to [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground).
2. Click the **gear icon** (top right) → check **"Use your own OAuth credentials"** → paste in the Client ID and Client Secret from step 4.
3. In the left panel, find **Google Calendar API v3**, expand it, and select `https://www.googleapis.com/auth/calendar.events`.
4. Click **Authorize APIs**. Sign in as `pru.aarief@gmail.com` and accept (you'll see an "unverified app" warning — click **Advanced → Go to [app name] (unsafe)**; this is expected since the app is yours and not yet published).
5. Click **Exchange authorization code for tokens**.
6. Copy the **Refresh token** value shown — this is the one you need. (Ignore the Access token — it expires in an hour; the server generates fresh ones from the refresh token automatically.)

## 6. Add the secrets to Vercel

In your Vercel project → **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | from step 4 |
| `GOOGLE_CLIENT_SECRET` | from step 4 |
| `GOOGLE_REFRESH_TOKEN` | from step 5 |

Then trigger a redeploy (env var changes don't apply to existing deployments automatically — push any commit, or hit "Redeploy" on the latest deployment in the Vercel dashboard).

## 7. Test it

Book any coaching slot on the live site as an agent. It should appear on your Google Calendar within a few seconds.

---

**One thing to watch for:** while the OAuth consent screen is in "Testing" status, Google expires test-user refresh tokens after 7 days — you'd need to redo step 5 weekly. To avoid that, go back to **OAuth consent screen** and click **Publish App** once steps 1–6 are working. Since this app is just for your own calendar (not requesting sensitive data from other users), you can publish it without going through Google's full verification review — you may just see the same "unverified app" warning on first use, same as in step 5.
