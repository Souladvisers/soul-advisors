/**
 * Estate Gap Check: saves leads and booking clicks to this Google Sheet.
 * Paste this into Extensions > Apps Script of your Google Sheet (see README step 1).
 */

// Optional: an email that gets an alert for every new lead. Leave "" to switch off.
const NOTIFY_EMAIL = "";

const LEAD_HEADERS = ["Timestamp", "Name", "Mobile", "Email", "PDPA consent", "Path", "Score",
  "Urgent gaps", "Other gaps", "Family", "Estate (S$)", "Property", "Source", "FC", "Page", "Status", "Notes"];
const BOOKING_HEADERS = ["Timestamp", "Name", "Mobile", "Path", "Score", "Source", "FC"];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

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
