# Estate Gap Check (/estate-check)

A free 3-minute lead magnet. Visitors take the Muslim (faraid) or general (Intestate Succession Act) path, enter their details with PDPA consent, and get an Estate Readiness Score and a personalised report.

| File | What it is |
|---|---|
| `public/estate-check.html` | The page, served at `/estate-check` (rewrite in `vercel.json`) |
| `public/estate-check-og.png` | Preview image shown when the link is shared on WhatsApp, Instagram or Facebook |
| `docs/estate-check-google-sheet.gs` | Apps Script that saves leads into the "Estate Gap Check Leads" Google Sheet |

## Google Sheet connection (done)

- Leads go to the **Estate Gap Check Leads** Google Sheet in pru.aarief@gmail.com's Drive.
- They are written by the Apps Script project **Estate Gap Check - Lead Capture** (script.google.com), deployed as a web app with access set to Anyone. Its code is in `docs/estate-check-google-sheet.gs`.
- New leads and booking clicks also send an email alert to `NOTIFY_EMAIL` in the script.
- If you edit the script, use **Deploy > Manage deployments > Edit > New version**. That keeps the same URL, which is set in `SHEET_URL` in `public/estate-check.html`.

## Links

- Bookings go by WhatsApp to `WHATSAPP_DEFAULT` (currently Arief).
- Add `&fc=<member id or first name>` to send bookings to a team member from `public/data.json`, for example `/estate-check?src=wa&fc=irsyad`.
- Add `?src=` to tag the channel: `ig-bio`, `ig-story`, `wa-status` or `roadshow`.
- Add `?demo=1` to show a "Fill demo details" button for testing.

## Before going public

- Get Prudential compliance sign-off on the questions, the report wording, the consent line and the captions.
- Replace the placeholder disclosure line in the footer.
