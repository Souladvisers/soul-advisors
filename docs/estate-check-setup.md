# Estate Gap Check (/estate-check)

A free 3-minute lead magnet. Visitors take the Muslim (faraid) or general (Intestate Succession Act) path, enter their details with PDPA consent, and get an Estate Readiness Score and a personalised report.

| File | What it is |
|---|---|
| `public/estate-check.html` | The page, served at `/estate-check` (rewrite in `vercel.json`) |
| `public/estate-check-engine.js` | Inheritance engine: Shafi'i faraid as applied in Singapore, and the Intestate Succession Act |
| `scripts/test-estate-engine.js` | Worked test cases for the engine. Run `node scripts/test-estate-engine.js` after any change |
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

## Status

- Compliance approved. Live at /estate-check since 8 Nov 2026.

## Faraid coverage (v2)

- **Heirs covered:** spouse (up to 4 wives), sons, daughters, son's sons and son's daughters, father, mother, father's father, both grandmothers, full siblings, half-siblings through the father, half-siblings through the mother, sons of full and paternal brothers, the father's full and paternal brothers, and their sons.
- **Rules covered:** blocking (hajb), al-awl, Umariyyatain, asabah ma'a al-ghayr (sisters with daughters), al-Musharraka, al-Akdariyya, a grandfather with siblings (Zayd method, shown as an estimate), and residue to Baitulmal (no radd, per Singapore Shafi'i practice).
- **Exclusions:** relatives who aren't Muslim, adopted children, stepchildren and a daughter's children.
- **Not covered:** great-grandchildren, the mu'adda refinements beyond the basic method, and missing persons, unborn children or simultaneous deaths. The Syariah Court's Inheritance Certificate is always the binding result.

## Report email (v3)

- After each lead is saved, the Apps Script turns the report into a PDF and emails it to the lead, with a short follow-up note.
- The email is sent from pru.aarief@gmail.com, but shows the FC's name as the sender. Replies go to the FC's email from `public/data.json`, or to Arief if the FC has none. The FC also gets a BCC copy.
- FC details always come from the site's team list, never from the form. Arief's client title is set in `CLIENT_TITLES`.
- Spam limits: at most 80 report emails a day, and one per address every 6 hours.
- The result is recorded in the **Report emailed** column (R) of the Leads tab.
- To test, run `testReportEmail` in the Apps Script editor. After any change to the script, use **Deploy > Manage deployments > Edit > New version** so the URL stays the same.
