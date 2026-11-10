/**
 * Estate Gap Check: saves leads and booking clicks to this Google Sheet.
 * Deployed as a web app (Execute as: Me, Who has access: Anyone).
 */

// Optional: an email that gets an alert for every new lead. Leave "" to switch off.
const NOTIFY_EMAIL = "pru.aarief@gmail.com";

// The "Estate Gap Check Leads" Google Sheet
const SHEET_ID = "1nP5ey5mgVIUTjJdELsWPUjOZFwkNz8LpHaP9RYzoS_I";

const LEAD_HEADERS = ["Timestamp", "Name", "Mobile", "Email", "PDPA consent", "Path", "Score",
  "Urgent gaps", "Other gaps", "Family", "Estate (S$)", "Property", "Source", "FC", "Page", "Status", "Notes"];
const BOOKING_HEADERS = ["Timestamp", "Name", "Mobile", "Path", "Score", "Source", "FC"];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SHEET_ID);

    if (d.type === "booking") {
      getSheet_(ss, "Bookings", BOOKING_HEADERS).appendRow([
        new Date(), clean_(d.name), "'" + clean_(d.mobile), clean_(d.path), d.score, clean_(d.src), clean_(d.fc)
      ]);
      notify_("Booking click: " + clean_(d.name), d);
    } else if (d.type === "lead" && d.consent === "Yes") {
      getSheet_(ss, "Leads", LEAD_HEADERS).appendRow([
        new Date(), clean_(d.name), "'" + clean_(d.mobile), clean_(d.email), "Yes", clean_(d.path), d.score,
        clean_(d.urgent), clean_(d.other_gaps), clean_(d.family), d.estate, clean_(d.property),
        clean_(d.src), clean_(d.fc), clean_(d.page), "New", ""
      ]);
      const leadsSheet = ss.getSheetByName("Leads"), leadRow = leadsSheet.getLastRow();
      lock.releaseLock();
      let status;
      try { status = sendReport_(d); } catch (mailErr) { status = "Failed: " + String(mailErr).slice(0, 150); }
      markEmailed_(leadsSheet, leadRow, status);
      notify_("New Estate Gap Check lead: " + clean_(d.name) + " (score " + d.score + ")", d);
    }
    return ContentService.createTextOutput("ok");
  } catch (err) {
    return ContentService.createTextOutput("error: " + err);
  } finally {
    lock.releaseLock();
  }
}

function getSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

// Stops anyone typing a formula into the form from running it in your sheet.
function clean_(v) {
  v = String(v == null ? "" : v).slice(0, 300);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function notify_(subject, d) {
  if (!NOTIFY_EMAIL) return;
  const body = [
    "Name: " + clean_(d.name),
    "Mobile: " + clean_(d.mobile),
    d.email ? "Email: " + clean_(d.email) : "",
    "Path: " + clean_(d.path) + "   Score: " + d.score,
    d.urgent ? "Urgent gaps: " + clean_(d.urgent) : "",
    "Source: " + clean_(d.src) + (d.fc ? "   FC: " + clean_(d.fc) : "")
  ].filter(String).join("\n");
  MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
}


/**
 * One-off setup: colour indicators, Singapore time zone and the "By FC" summary tab.
 * Safe to run again (for example after adding a new FC to the FCS list).
 */
function setupIndicators() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ss.setSpreadsheetLocale("en_SG");
  ss.setSpreadsheetTimeZone("Asia/Singapore");
  const leads = getSheet_(ss, "Leads", LEAD_HEADERS);
  const book = getSheet_(ss, "Bookings", BOOKING_HEADERS);

  // One colour per FC (name exactly as it appears in the FC column)
  const FCS = [
    ["Abdullah Arief Ali", "#CFE5DF"], ["Noraziemah", "#FCE4D6"], ["Dzulqarnain", "#E2EFDA"],
    ["Suhaimi Ahmad", "#DDEBF7"], ["Muhammad Irsyad", "#FFF2CC"], ["Iqbal Nikmatullah", "#EADCF2"],
    ["ilyani ali", "#F8DCE6"], ["Yaxin", "#E7E6E6"], ["Farid", "#D9E1F2"]
  ];
  const fcRules = (sheet, col) => {
    const r = sheet.getRange(col + "2:" + col);
    const out = FCS.map(([n, c]) => SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(n).setBackground(c).setBold(true).setRanges([r]).build());
    out.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied("=AND($B2<>\"\",$" + col + "2=\"\")")
      .setBackground("#F4B183").setRanges([r]).build());
    return out;
  };

  const status = leads.getRange("P2:P");
  const st = (txt, bg, fg) => {
    const b = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(txt).setBackground(bg).setRanges([status]);
    if (fg) b.setFontColor(fg);
    return b.build();
  };
  const score = leads.getRange("G2:G");
  const sc = (f, bg) => SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(f).setBackground(bg).setRanges([score]).build();

  leads.setConditionalFormatRules([].concat(
    fcRules(leads, "N"),
    [st("New", "#FFF2CC"), st("Contacted", "#DDEBF7"), st("Review booked", "#C6E0B4"),
     st("Review done", "#A9D08E"), st("Client", "#548235", "#FFFFFF"), st("Not interested", "#D9D9D9", "#7F7F7F")],
    [sc("=AND(ISNUMBER($G2),$G2<50)", "#F8CBAD"), sc("=AND(ISNUMBER($G2),$G2>=50,$G2<80)", "#FFE699"),
     sc("=AND(ISNUMBER($G2),$G2>=80)", "#C6E0B4")]
  ));
  book.setConditionalFormatRules(fcRules(book, "G"));
  leads.getRange("A2:A").setNumberFormat("d mmm yyyy h:mm am/pm");
  book.getRange("A2:A").setNumberFormat("d mmm yyyy h:mm am/pm");
  leads.getRange("K2:K").setNumberFormat("#,##0");

  // Summary tab
  let sum = ss.getSheetByName("By FC");
  if (!sum) sum = ss.insertSheet("By FC", 2);
  sum.clear();
  sum.getRange("A1").setValue("Leads and bookings by FC").setFontSize(14).setFontWeight("bold");
  sum.getRange("A2").setValue("Updates automatically. A blank FC means the lead came from a link without &fc= (it shows orange in the Leads tab).")
    .setFontColor("#666666");
  sum.getRange("A4").setValue("Leads");
  sum.getRange("E4").setValue("Booking clicks");
  sum.getRange("H4").setValue("Leads by status");
  sum.getRangeList(["A4", "E4", "H4"]).setFontWeight("bold").setFontColor("#1C5A50");
  sum.getRange("A5").setFormula('=IFERROR(QUERY(Leads!A2:Q,"select N, count(B), avg(G) where B is not null group by N order by count(B) desc label N \'FC\', count(B) \'Leads\', avg(G) \'Avg score\'",0),"No leads yet")');
  sum.getRange("E5").setFormula('=IFERROR(QUERY(Bookings!A2:G,"select G, count(B) where B is not null group by G order by count(B) desc label G \'FC\', count(B) \'Booking clicks\'",0),"No bookings yet")');
  sum.getRange("H5").setFormula('=IFERROR(QUERY(Leads!A2:Q,"select N, count(B) where B is not null group by N pivot P",0),"No leads yet")');
  sum.getRange("C6:C200").setNumberFormat("0");
  sum.getRangeList(["A5:C5", "E5:F5", "H5:O5"]).setFontWeight("bold").setBackground("#E2EEEB");
  sum.setColumnWidth(1, 180); sum.setColumnWidth(5, 180); sum.setColumnWidth(8, 180);
  sum.setColumnWidth(4, 30); sum.setColumnWidth(7, 30);
  sum.setFrozenRows(5);
  sum.setConditionalFormatRules(fcRules(sum, "A").slice(0, FCS.length));
  return "done";
}


/* ======================= Report email (PDF) ======================= */

const SITE = "https://soul-advisors.vercel.app";
const DEFAULT_FC_CODE = "arief";
const CLIENT_TITLES = { "arief": "Deputy Director, Wealth Services" }; // titles used in client emails
const DAILY_EMAIL_CAP = 80;          // Gmail allows about 100 recipients a day on a personal account
const PER_ADDRESS_HOURS = 6;         // one report per email address in this window

// Looks up the FC on the site's team list (public/data.json), so name, email and WhatsApp
// always come from the site, never from what the form sends.
function findFc_(code) {
  code = String(code || DEFAULT_FC_CODE).toLowerCase().trim();
  const cache = CacheService.getScriptCache();
  let team = null;
  try { team = JSON.parse(cache.get("team") || "null"); } catch (e) {}
  if (!team) {
    const res = UrlFetchApp.fetch(SITE + "/data.json", { muteHttpExceptions: true });
    const members = (JSON.parse(res.getContentText()).members) || [];
    team = members.map(m => {
      let wa = String(m.whatsapp || "").replace(/\D/g, "");
      if (wa.length === 8) wa = "65" + wa;
      return {
        keys: [m.id, m.subdomain].concat(String(m.name || "").split(/\s+/)).filter(Boolean).map(k => String(k).toLowerCase()),
        name: String(m.name || "").trim(), title: String(m.title || "Financial Consultant").trim(),
        email: String(m.email || "").trim(), whatsapp: wa
      };
    });
    try { cache.put("team", JSON.stringify(team), 1800); } catch (e) {}
  }
  const pick = c => team.find(t => t.keys.indexOf(c) > -1);
  const fc = pick(code) || pick(DEFAULT_FC_CODE) || { name: "SOUL Guild", title: "", email: "", whatsapp: "6585229299", keys: [] };
  const fallback = pick(DEFAULT_FC_CODE) || {};
  const key = fc.keys.indexOf(DEFAULT_FC_CODE) > -1 ? DEFAULT_FC_CODE : "";
  return {
    name: fc.name, title: CLIENT_TITLES[key] || fc.title,
    email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fc.email) ? fc.email : "",
    replyTo: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fc.email) ? fc.email : (fallback.email || ""),
    whatsapp: fc.whatsapp || fallback.whatsapp || "6585229299"
  };
}

function canEmail_(to) {
  const props = PropertiesService.getScriptProperties();
  const day = "sent_" + Utilities.formatDate(new Date(), "Asia/Singapore", "yyyyMMdd");
  const n = Number(props.getProperty(day) || 0);
  if (n >= DAILY_EMAIL_CAP) return "daily limit reached";
  const cache = CacheService.getScriptCache();
  const key = "to_" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, to.toLowerCase()));
  if (cache.get(key)) return "already sent to this address recently";
  cache.put(key, "1", PER_ADDRESS_HOURS * 3600);
  props.setProperty(day, String(n + 1));
  return "";
}

const h_ = v => String(v == null ? "" : v).slice(0, 1200)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const list_ = (a, max) => (Array.isArray(a) ? a : []).slice(0, max || 40);

function reportHtml_(name, r, fc) {
  const ink = "#14201e", muted = "#566864", line = "#dbe3e0", accent = "#1c5a50", soft = "#e2eeeb";
  const sevColor = s => s === "Urgent" ? "#b23a30" : "#a86d12";
  const score = Math.max(0, Math.min(100, Number(r.score) || 0));
  const scoreColor = score >= 80 ? "#2d7449" : score >= 50 ? "#a86d12" : "#b23a30";
  const date = Utilities.formatDate(new Date(), "Asia/Singapore", "d MMMM yyyy");
  const rows = list_(r.rows, 30).map(x => `<tr>
      <td style="padding:7px 6px;border-bottom:1px solid ${line}">${h_(x.label)}</td>
      <td style="padding:7px 6px;border-bottom:1px solid ${line};text-align:right"><b>${h_(x.share)}</b><br><span style="color:${muted}">${h_(x.pct)}</span></td>
      <td style="padding:7px 6px;border-bottom:1px solid ${line};text-align:right">${h_(x.amount)}</td>
      <td style="padding:7px 6px;border-bottom:1px solid ${line};text-align:right">${h_(x.each) || "-"}</td>
      <td style="padding:7px 6px;border-bottom:1px solid ${line};color:${muted};font-size:9.5pt">${h_(x.why)}</td></tr>`).join("");
  const gaps = list_(r.gaps, 15).map(g => `<div style="border-left:4px solid ${sevColor(g.sev)};padding:2px 0 2px 10px;margin:0 0 12px">
      <div style="font-weight:bold">${h_(g.title)} <span style="color:${sevColor(g.sev)};font-size:9pt">(${h_(g.sev)})</span></div>
      <div style="color:${muted};font-size:10pt">${h_(g.body)}</div></div>`).join("") || `<p style="color:${muted}">We didn't find any gaps from your answers.</p>`;
  const goods = list_(r.goods, 15).map(g => `<div style="border-left:4px solid #2d7449;padding:2px 0 2px 10px;margin:0 0 10px">
      <div style="font-weight:bold">${h_(g.title)}</div><div style="color:${muted};font-size:10pt">${h_(g.body)}</div></div>`).join("");
  const notes = list_(r.notes, 8).map(n => `<p style="border-left:3px solid #9c7028;padding-left:10px;margin:10px 0">${h_(n)}</p>`).join("");
  const gloss = list_(r.glossary, 20).map(g => `<tr><td style="padding:5px 8px 5px 0;vertical-align:top;font-weight:bold;width:32%">${h_(g[0])}</td><td style="padding:5px 0;color:${muted}">${h_(g[1])}</td></tr>`).join("");
  return `<html><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif;color:${ink};font-size:10.5pt;line-height:1.45">
  <div style="background:${accent};color:#fff;padding:18px 22px">
    <div style="font-size:9pt;letter-spacing:2px">SOUL GUILD · ESTATE PLANNING</div>
    <div style="font-size:20pt;font-weight:bold;margin-top:6px">Estate Gap Check report</div>
    <div style="margin-top:4px">Prepared for ${h_(name)} · ${h_(r.path)} · ${date}</div>
  </div>
  <table style="width:100%;margin:18px 0;border-collapse:collapse"><tr>
    <td style="width:120px;text-align:center;vertical-align:middle;border:3px solid ${scoreColor};padding:12px">
      <div style="font-size:30pt;font-weight:bold;color:${scoreColor}">${score}</div><div style="color:${muted};font-size:9pt">out of 100</div></td>
    <td style="padding-left:18px;vertical-align:middle">
      <div style="font-size:13pt;font-weight:bold">Estate Readiness Score: ${h_(r.band)}</div>
      <div style="color:${muted};margin-top:4px">The score shows how prepared your family is, not how much you own. The last page explains each term.</div></td>
  </tr></table>
  <h2 style="font-size:14pt;color:${accent};margin:18px 0 4px">If you passed away tomorrow</h2>
  <p style="color:${muted};margin:0 0 8px">${h_(r.intro)}</p>
  <table style="width:100%;border-collapse:collapse;font-size:10pt">
    <tr style="background:${soft}"><th style="text-align:left;padding:6px">Who</th><th style="text-align:right;padding:6px">Share</th><th style="text-align:right;padding:6px">Amount</th><th style="text-align:right;padding:6px">Each</th><th style="text-align:left;padding:6px">Why</th></tr>
    ${rows}</table>
  ${notes}
  <p style="color:${muted};font-size:8.5pt">${h_(r.caveat)}</p>
  <h2 style="font-size:14pt;color:${accent};margin:22px 0 10px">Gaps to close, most urgent first</h2>
  ${gaps}
  ${goods ? `<h2 style="font-size:14pt;color:${accent};margin:22px 0 10px">Already in place</h2>${goods}` : ""}
  <div style="background:${soft};padding:14px 16px;margin:20px 0">
    <div style="font-weight:bold;font-size:12pt">Your next step: a free 30-minute Estate Gap Review</div>
    <div style="margin-top:4px">${h_(fc.name)}${fc.title ? ", " + h_(fc.title) : ""}, will go through this report with you and show you what to fix first.
    WhatsApp: +${h_(fc.whatsapp)}${fc.email ? " · Email: " + h_(fc.email) : ""}</div>
  </div>
  <h2 style="font-size:14pt;color:${accent};margin:22px 0 6px">How to read this report</h2>
  <table style="width:100%;border-collapse:collapse;font-size:9.5pt">${gloss}</table>
  <p style="color:${muted};font-size:8.5pt;margin-top:18px">This check is a simplified educational illustration based on the answers you gave. It is not legal, financial or religious advice.</p>
  </body></html>`;
}

function emailHtml_(first, r, fc, waLink) {
  const urgent = list_(r.gaps, 15).filter(g => g.sev === "Urgent").slice(0, 3);
  const top = urgent.length ? urgent : list_(r.gaps, 3);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#14201e;max-width:600px">
  <p>Hi ${h_(first)},</p>
  <p>Thank you for completing the Estate Gap Check. Your full report is attached as a PDF, so you can keep it and share it with your family.</p>
  <p>Your Estate Readiness Score is <b>${h_(r.score)} out of 100</b> (${h_(r.band)}).${top.length ? " The gaps worth looking at first are:" : ""}</p>
  ${top.length ? `<ul>${top.map(g => `<li><b>${h_(g.title)}</b></li>`).join("")}</ul>` : ""}
  <p>Most of these take one conversation to sort out. I'd be glad to go through your report with you in a free 30-minute Estate Gap Review, at a time that suits you.</p>
  <p><a href="${waLink}" style="background:#1c5a50;color:#ffffff;padding:10px 16px;text-decoration:none;display:inline-block">Book my free review on WhatsApp</a></p>
  <p>Or simply reply to this email.</p>
  <p>Warm regards,<br><b>${h_(fc.name)}</b>${fc.title ? "<br>" + h_(fc.title) : ""}<br>SOUL Guild<br>WhatsApp: +${h_(fc.whatsapp)}</p>
  <p style="font-size:11px;color:#566864">You're receiving this because you completed the Estate Gap Check and agreed to be contacted about your report. If you'd rather not hear from us, reply "unsubscribe".</p>
  </div>`;
}

function sendReport_(d) {
  const to = String(d.email || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || to.length > 120) return "Not sent: invalid email";
  if (!d.report || typeof d.report !== "object") return "Not sent: no report data";
  const block = canEmail_(to);
  if (block) return "Not sent: " + block;
  const fc = findFc_(d.fc_code);
  const name = String(d.name || "").slice(0, 80) || "there";
  const first = name.split(" ")[0];
  const r = d.report;
  const waText = `Hi ${fc.name.split(" ")[0]}, I've received my Estate Gap Check report (score ${Number(r.score) || 0}/100). I'd like to book my free Estate Gap Review. My name is ${name}.`;
  const waLink = "https://wa.me/" + fc.whatsapp + "?text=" + encodeURIComponent(waText);
  const pdf = Utilities.newBlob(reportHtml_(name, r, fc), MimeType.HTML, "report.html").getAs(MimeType.PDF)
    .setName("Estate Gap Check report - " + name.replace(/[^\w .-]/g, "") + ".pdf");
  const opts = {
    to: to, subject: "Your Estate Gap Check report",
    htmlBody: emailHtml_(first, r, fc, waLink), name: fc.name + " | SOUL Guild", attachments: [pdf]
  };
  if (fc.replyTo) opts.replyTo = fc.replyTo;
  if (fc.email && fc.email.toLowerCase() !== Session.getEffectiveUser().getEmail().toLowerCase()) opts.bcc = fc.email; // FC gets a copy
  MailApp.sendEmail(opts);
  return "Sent " + Utilities.formatDate(new Date(), "Asia/Singapore", "d MMM yyyy h:mm a");
}

function markEmailed_(sheet, row, status) {
  if (!sheet.getRange(1, 18).getValue()) sheet.getRange(1, 18).setValue("Report emailed").setFontWeight("bold").setBackground("#1C5A50").setFontColor("#FFFFFF");
  sheet.getRange(row, 18).setValue(status);
}

// Run this once from the editor to check the email and PDF: it sends a sample report to you.
function testReportEmail() {
  const me = Session.getEffectiveUser().getEmail();
  const sample = { name: "Test Client", email: me, fc_code: "arief", report: {
    path: "Muslim path", score: 28, band: "Significant gaps", estate: "S$600,000",
    intro: "How faraid would divide an estate of S$600,000, after funeral costs, debts and any valid wasiat are paid.",
    rows: [{ label: "Wife", share: "1/8", pct: "12.5%", amount: "S$75,000", each: "", why: "1/8 fixed share, because you have children" },
           { label: "Son", share: "17/36", pct: "47.2%", amount: "S$283,333", each: "", why: "Residue (asabah), male twice the female" }],
    notes: ["Sample note."], caveat: "Sample caveat.", gaps: [{ title: "Wasiat", sev: "Urgent", body: "Sample gap." }],
    goods: [], glossary: [["Faraid", "The Islamic law of inheritance."]] } };
  CacheService.getScriptCache().remove("to_" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, me.toLowerCase())));
  return sendReport_(sample);
}
