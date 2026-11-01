/**
 * מעבר להפקת PDF ב־CRM (בלי Google Docs).
 *
 * להדביק במקום doPost / processSelectedRows הרלוונטיים בפרויקט Apps Script,
 * ואז: Deploy → Manage deployments → Edit → Version: New → Deploy.
 *
 * זרימה חדשה:
 * 1) CRM מייצר PDF + מעלה ל־Drive + כותב עמודה N
 * 2) CRM קורא webhook עם action=emailCertificates / skipPdfGeneration=true
 * 3) הסקריפט רק שולח מייל + מסמן עמודה J
 *
 * אם אין PDF בעמודה N — מחזירים שגיאה (לא יוצרים Docs).
 */

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

    // סנכרון משתתפים מה־CRM (ללא הנפקה)
    if (action === "sync") {
      // משאירים את לוגיקת sync הקיימת בפרויקט — לא נגע כאן.
      // אם אין sync בגרסה זו, מחזירים הודעה ברורה.
      return ContentService.createTextOutput(
        JSON.stringify({
          success: false,
          message:
            "action=sync — השתמשו בגרסת doPost המלאה עם סנכרון, או קראו ל־emailCertificates בלבד",
        }),
      ).setMimeType(ContentService.MimeType.JSON);
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

    var range = sheet.getRange(2, 1, lastRow - 1, 14);
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
      var existingPdfUrl = row[13]
        ? String(row[13]).trim()
        : "";

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
