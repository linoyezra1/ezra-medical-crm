/**
 * מעבר להפקת PDF ב־CRM (בלי Google Docs) + סנכרון שורות לגיליון.
 *
 * להדביק במקום doPost / processSelectedRows הרלוונטיים בפרויקט Apps Script,
 * ואז: Deploy → Manage deployments → Edit → Version: New → Deploy.
 *
 * זרימות:
 * A) action=sync + participantsToAdd → כתיבה/עדכון שורות בגיליון (בלי Docs)
 * B) action=emailCertificates / skipPdfGeneration=true → מייל בלבד לפי עמודה N
 *
 * אם אין PDF בעמודה N בהנפקה — מחזירים שגיאה (לא יוצרים Docs).
 *
 * חשוב: כתיבת שורות חדשות ב־sync נעשית ב־setValues ל־A:U בשורה ריקה
 * (לא appendRow) — כדי לא להזיז עמודות כשיש תאים יתומים.
 */

function parseToDate_(value) {
  if (value == null || value === "") return null;
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return value;
  }
  var s = String(value).trim();
  var m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) {
    var d = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10) - 1;
    var y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    var dt = new Date(y, mo, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  var parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function buildParticipantSheetRow_(p) {
  var hours = p.hoursScope || p.hours || "";
  var inviter = p.inviterName || p.organizerName || "";
  var crmId = p.crmId || p.id || "";
  var courseDate = parseToDate_(p.courseDate) || p.courseDate || "";
  var attended =
    p.attendanceStatus != null && String(p.attendanceStatus).trim() !== ""
      ? p.attendanceStatus
      : p.attendance === false
        ? "לא נכח"
        : "TRUE";
  var street = p.street || p.address || "";
  var zip = p.zipCode || p.postalCode || "";
  var category = p.courseCategory || p.category || "";
  var certifyingBody = p.certifyingBody || "";

  return [
    p.fullName || "", // A
    p.idNumber || "", // B
    courseDate, // C
    p.email || "", // D
    p.phone || "", // E
    hours, // F
    "", // G
    "", // H
    "", // I
    "", // J
    inviter, // K
    Utilities.formatDate(new Date(), "Asia/Jerusalem", "dd/MM/yyyy HH:mm"), // L
    crmId, // M
    p.certificatePdfUrl || p.pdfUrl || p.certificateUrl || "", // N
    attended, // O
    p.city || "", // P
    street, // Q
    p.houseNumber || "", // R
    zip, // S
    category, // T
    certifyingBody, // U
  ];
}

function findRowByCrmId_(sheet, crmId) {
  var id = String(crmId || "").trim();
  if (!id) return 0;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var values = sheet.getRange(2, 13, lastRow, 13).getValues(); // M
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || "").trim() === id) return i + 2;
  }
  return 0;
}

/** שורה ראשונה שבה עמודה A ריקה (אחרי כותרת) — בלי appendRow */
function findNextEmptyRowByColA_(sheet) {
  var lastRow = Math.max(sheet.getLastRow(), 1);
  var values = sheet.getRange(1, 1, lastRow, 1).getValues();
  for (var i = 1; i < values.length; i++) {
    if (!String(values[i][0] || "").trim()) return i + 1;
  }
  return lastRow + 1;
}

function syncParticipantsToSheet_(sheet, participantsToAdd) {
  var added = 0;
  var updated = 0;

  for (var i = 0; i < participantsToAdd.length; i++) {
    var p = participantsToAdd[i] || {};
    var rowValues = buildParticipantSheetRow_(p);
    while (rowValues.length < 21) rowValues.push("");
    rowValues = rowValues.slice(0, 21);

    var crmId = rowValues[12];
    var existingRow = findRowByCrmId_(sheet, crmId);

    if (existingRow > 0) {
      sheet.getRange(existingRow, 16, 1, 6).setValues([
        [
          rowValues[15],
          rowValues[16],
          rowValues[17],
          rowValues[18],
          rowValues[19],
          rowValues[20],
        ],
      ]);
      if (rowValues[0]) sheet.getRange(existingRow, 1).setValue(rowValues[0]);
      if (rowValues[1]) sheet.getRange(existingRow, 2).setValue(rowValues[1]);
      if (rowValues[2]) sheet.getRange(existingRow, 3).setValue(rowValues[2]);
      if (rowValues[3]) sheet.getRange(existingRow, 4).setValue(rowValues[3]);
      if (rowValues[4]) sheet.getRange(existingRow, 5).setValue(rowValues[4]);
      if (rowValues[5]) sheet.getRange(existingRow, 6).setValue(rowValues[5]);
      if (rowValues[10]) sheet.getRange(existingRow, 11).setValue(rowValues[10]);
      if (rowValues[13]) sheet.getRange(existingRow, 14).setValue(rowValues[13]);
      if (rowValues[14]) sheet.getRange(existingRow, 15).setValue(rowValues[14]);
      updated++;
    } else {
      var nextRow = findNextEmptyRowByColA_(sheet);
      sheet.getRange(nextRow, 1, 1, 21).setValues([rowValues]);
      added++;
    }
  }

  if (typeof autoFillCertDetails === "function") {
    autoFillCertDetails(sheet);
  }
  return { added: added, updated: updated };
}

function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    var pin = data.pin || data.authPin;
    var action = String(data.action || "").trim();
    var skipPdf =
      data.skipPdfGeneration === true ||
      data.skipPdfGeneration === "true" ||
      action === "emailCertificates";

    if (String(pin).trim() !== CONFIG.SECURITY_PIN) {
      return ContentService.createTextOutput(
        JSON.stringify({
          success: false,
          message: "קוד אבטחה שגוי",
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
      return ContentService.createTextOutput(
        JSON.stringify({
          success: false,
          message: 'שגיאה: הטאב "' + CONFIG.SHEET_NAME + '" לא נמצא בגיליון!',
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // סנכרון משתתפים מה־CRM (ללא הנפקה / בלי Docs)
    // רק action===sync — לא לפי קיום participantsToAdd (מערך ריק הוא truthy)
    if (action === "sync") {
      var toAdd = Array.isArray(data.participantsToAdd)
        ? data.participantsToAdd
        : [];
      var result = syncParticipantsToSheet_(sheet, toAdd);
      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          message:
            "סונכרנו " +
            result.added +
            " חדשים, עודכנו " +
            result.updated +
            " (כולל כתובת P–S וקטגוריה T)",
          addedCount: result.added,
          updatedCount: result.updated,
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (!skipPdf && action !== "emailCertificates" && action !== "generateCertificates") {
      // בקשות לא מוכרות — לא יוצרים Docs
    }

    autoFillCertDetails(sheet);
    try {
      syncPrintStatusToCertificates(ss);
    } catch (syncErr) {
      Logger.log("syncPrintStatusToCertificates: " + syncErr);
    }

    var rawParticipantIds = data.participantIds || [];
    var participantIds = Array.isArray(rawParticipantIds)
      ? rawParticipantIds.map(function (id) {
          return String(id).trim();
        })
      : rawParticipantIds
        ? [String(rawParticipantIds).trim()]
        : [];

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return ContentService.createTextOutput(
        JSON.stringify({
          success: false,
          message: "אין שורות בגיליון להפקה",
          processedCount: 0,
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var range = sheet.getRange(2, 1, lastRow, 14);
    var values = range.getValues();
    var processedCount = 0;
    var skippedNoPdf = 0;
    var skippedNoEmail = 0;

    // מפת CRM id → URL מה־payload (גיבוי אם עמודה N עדיין לא עודכנה)
    var urlFromPayload = {};
    var payloadParticipants = data.participants || [];
    if (Array.isArray(payloadParticipants)) {
      for (var pi = 0; pi < payloadParticipants.length; pi++) {
        var pp = payloadParticipants[pi] || {};
        var pid = String(pp.crmId || pp.id || "").trim();
        var purl = String(
          pp.certificatePdfUrl || pp.pdfUrl || pp.certificateUrl || "",
        ).trim();
        if (pid && purl) urlFromPayload[pid] = purl;
      }
    }

    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var rowIndex = i + 2;

      if (typeof isNotAttendedRow_ === "function") {
        if (isNotAttendedRow_(sheet, rowIndex, row)) continue;
      }

      var crmParticipantId = row[12] ? String(row[12]).trim() : "";

      if (participantIds.length > 0 && participantIds[0] !== "") {
        var isMatch = participantIds.some(function (id) {
          return (
            id === crmParticipantId ||
            (crmParticipantId && crmParticipantId.indexOf(id) !== -1)
          );
        });
        if (!isMatch) continue;
      }

      var fullName = row[0];
      var email = row[3];
      var hours = row[5];
      var existingPdfUrl = row[13] ? String(row[13]).trim() : "";

      if (!existingPdfUrl && crmParticipantId && urlFromPayload[crmParticipantId]) {
        existingPdfUrl = urlFromPayload[crmParticipantId];
        sheet.getRange(rowIndex, 14).setValue(existingPdfUrl);
      }

      if (!fullName || !email) {
        skippedNoEmail++;
        continue;
      }

      var pdfFile = null;
      if (existingPdfUrl) {
        pdfFile = getFileFromUrlOrId(existingPdfUrl);
      }

      // גיבוי: הורדת הקובץ ב־URL אם DriveApp לא מצליח לפתוח לפי ID
      var attachmentBlob = null;
      if (!pdfFile && existingPdfUrl) {
        try {
          var resp = UrlFetchApp.fetch(existingPdfUrl, {
            muteHttpExceptions: true,
            followRedirects: true,
          });
          if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 400) {
            attachmentBlob = resp
              .getBlob()
              .setName(
                String(fullName || "certificate").replace(/[\\/:*?"<>|]/g, " ") +
                  ".pdf",
              );
          }
        } catch (fetchErr) {
          Logger.log("UrlFetch PDF failed: " + fetchErr);
        }
      }

      if (!pdfFile && !attachmentBlob) {
        skippedNoPdf++;
        Logger.log(
          "אין PDF מוכן ב־CRM/עמודה N לשורה " +
            rowIndex +
            " (" +
            fullName +
            ") — Docs כבוי",
        );
        continue;
      }

      if (pdfFile) {
        sendCertificateEmail(email, fullName, hours, pdfFile);
      } else {
        sendCertificateEmailBlob_(email, fullName, hours, attachmentBlob);
      }
      sheet.getRange(rowIndex, 10).setValue(true);
      processedCount++;
    }

    if (processedCount === 0 && skippedNoPdf > 0) {
      return ContentService.createTextOutput(
        JSON.stringify({
          success: false,
          message:
            "לא נמצא PDF מוכן ב־CRM (עמודה N) עבור השורות שנבחרו. הפקת Docs בוטלה — יש להנפיק מחדש מה־CRM.",
          processedCount: 0,
          skippedNoPdf: skippedNoPdf,
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        message:
          "נשלחו " +
          processedCount +
          " מיילים עם תעודות (PDF מ־CRM, ללא Google Docs)",
        processedCount: processedCount,
        skippedNoPdf: skippedNoPdf,
        skippedNoEmail: skippedNoEmail,
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        message: "שגיאה בעיבוד הנתונים: " + error.toString(),
        processedCount: 0,
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/** שליחת מייל עם Blob (כשאין File מ־DriveApp) */
function sendCertificateEmailBlob_(email, fullName, hours, pdfBlob) {
  var subject =
    "תעודת מגיש עזרה ראשונה | " + fullName + " | " + hours + " שעות";
  var htmlBody =
    '<div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #333; line-height: 1.6; text-align: right;">' +
    "<p>שלום " +
    fullName +
    "</p>" +
    "<p>ברכות על סיום קורס עזרה ראשונה בהיקף " +
    hours +
    " שעות – בהצלחה!</p>" +
    "<p>מצורפת תעודת מגיש עזרה ראשונה.</p>" +
    "<p>נהנית מההדרכה? אשמח שתדרג אותנו בגוגל ותוסיף תגובה:</p>" +
    '<p><a href="' +
    CONFIG.REVIEW_LINK +
    '" target="_blank" style="color: #0066cc; font-weight: bold; text-decoration: underline;">לחצו כאן לדירוג בגוגל</a></p>' +
    "<br><p>לרענון התעודה או לכל שאלה, ניתן לפנות בטלפון:</p>" +
    "<p><strong>053-9111505 – יצחק.</strong></p>" +
    "<br><p>בברכה,</p><p><strong>עזרה ורפואה</strong></p></div>";

  GmailApp.sendEmail(email, subject, "", {
    htmlBody: htmlBody,
    attachments: [pdfBlob],
  });
}

/**
 * הפקה ידנית מתפריט Sheets — בלי Docs.
 * אם אין PDF בעמודה N, מציגים התראה לפנות ל־CRM.
 */
function processSelectedRows(_templateDocId) {
  var ui = SpreadsheetApp.getUi();
  ui.alert(
    "הפקת תעודות עברה ל־CRM",
    "יצירת PDF מ־Google Docs בוטלה.\n\nיש להנפיק תעודות ממערכת ה־CRM (הנפק ושלח תעודות).\nהסקריפט שולח מייל רק כשקיים קישור PDF בעמודה N.",
    ui.ButtonSet.OK,
  );
}

/** חוסם יצירת Docs אם נקרא בטעות */
function createCertificatePDF() {
  throw new Error(
    "createCertificatePDF בוטל — הפקת תעודות מתבצעת ב־CRM בלבד",
  );
}
