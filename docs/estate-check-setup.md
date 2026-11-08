# Estate Gap Check (/estate-check)

A free 3-minute lead magnet. Visitors take the Muslim (faraid) or general (Intestate Succession Act) path, enter their details with PDPA consent, and get an Estate Readiness Score and a personalised report.

| File | What it is |
|---|---|
| `public/estate-check.html` | The page, served at `/estate-check` (rewrite in `vercel.json`) |
| `public/estate-check-og.png` | Preview image shown when the link is shared on WhatsApp, Instagram or Facebook |
| `docs/estate-check-google-sheet.gs` | Apps Script that saves leads into the "Estate Gap Check Leads" Google Sheet |

## Connect the Google Sheet

1. Open the **Estate Gap Check Leads** sheet in Google Drive.
2. Go to **Extensions > Apps Script**, paste in `docs/estate-check-google-sheet.gs`, and save. To get an email for each lead, set `NOTIFY_EMAIL`.
3. Go to **Deploy > New deployment > Web app**. Set Execute as: **Me** and Who has access: **Anyone**, then deploy and authorise.
4. Paste the `/exec` URL into `SHEET_URL` in the `CONFIG` block of `public/estate-check.html`, then commit.

Until `SHEET_URL` is set, the page works, but leads are not saved.

## Links

- Bookings go by WhatsApp to `WHATSAPP_DEFAULT` (currently Arief).
- Add `&fc=<member id or first name>` to send bookings to a team member from `public/data.json`, for example `/estate-check?src=wa&fc=irsyad`.
- Add `?src=` to tag the channel: `ig-bio`, `ig-story`, `wa-status` or `roadshow`.
- Add `?demo=1` to show a "Fill demo details" button for testing.

## Before going public

- Get Prudential compliance sign-off on the questions, the report wording, the consent line and the captions.
- Replace the placeholder disclosure line in the footer.
