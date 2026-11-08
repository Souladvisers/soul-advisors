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
    ["ilyani ali", "#F8DCE6"], ["Yaxin", "#E7E6E6"]
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
