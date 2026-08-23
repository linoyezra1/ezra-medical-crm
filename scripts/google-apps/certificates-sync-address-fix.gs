/**
 * תיקון doPost — סנכרון כתובת (P–S) + קטגוריה (T) + הנפקת תעודות.
 *
 * ============================================================
 * מה לתקן בסקריפט הקיים שלך (חשוב!)
 * ============================================================
 * 1) התנאי לסנכרון חייב להיות רק:
 *      if (action === "sync") { ... }
 *    לא: if (action === "sync" || data.participantsToAdd)
 *    כי גם מערך ריק [] הוא truthy — וזה שובר הנפקת תעודות.
 *
 * 2) בסיום השורה ב־appendRow / buildRow להוסיף עמודה T:
 *      p.courseCategory || p.category || ""
 *
 * 3) סדר עמודות מלא (A–T) לפי CRM:
 *    A שם | B ת״ז | C תאריך | D מייל | E טלפון | F היקף שעות
 *    G מספר תעודה | H תוקף | I הודפס | J נשלח מייל
 *    K מזמין | L תאריך ייצוא | M CRM ID | N PDF | O נוכחות
 *    P עיר | Q כתובת/רחוב | R מספר בית | S מיקוד | T קטגוריה
 *
 * 4) L = תאריך ייצוא (לא נוכחות). O = נוכחות ("TRUE" / "לא נכח").
 *
 * 5) שדות מה-CRM:
 *    hoursScope || hours
 *    inviterName || organizerName
 *    crmId || id
 *    street || address
 *    zipCode || postalCode
 *    courseCategory || category
 *
 * 6) לשורות קיימות: לעדכן P–T לפי CRM ID בעמודה M (לא רק append).
 *
 * אחרי הדבקה: Deploy → Manage deployments → Version: New → Deploy.
 */

function buildParticipantSheetRow_(p) {
  const hours = p.hoursScope || p.hours || "";
  const inviter = p.inviterName || p.organizerName || "";
  const crmId = p.crmId || p.id || "";
  const courseDate = parseToDate(p.courseDate) || p.courseDate || "";
  const attended =
    p.attendanceStatus != null && String(p.attendanceStatus).trim() !== ""
      ? p.attendanceStatus
      : p.attendance === false
        ? "לא נכח"
        : "TRUE";
  const street = p.street || p.address || "";
  const zip = p.zipCode || p.postalCode || "";
  const category = p.courseCategory || p.category || "";

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
    "", // N
    attended, // O
    p.city || "", // P
    street, // Q
    p.houseNumber || "", // R
    zip, // S
    category, // T קטגוריה
  ];
}

function findRowByCrmId_(sheet, crmId) {
  const id = String(crmId || "").trim();
  if (!id) return 0;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, 13, lastRow - 1, 1).getValues(); // M
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || "").trim() === id) return i + 2;
  }
  return 0;
}

function syncParticipantsToSheet_(sheet, participantsToAdd) {
  let added = 0;
  let updated = 0;

  for (let i = 0; i < participantsToAdd.length; i++) {
    const p = participantsToAdd[i] || {};
    const rowValues = buildParticipantSheetRow_(p);
    const crmId = rowValues[12];
    const existingRow = findRowByCrmId_(sheet, crmId);

    if (existingRow > 0) {
      // P–T: עיר, רחוב, מספר בית, מיקוד, קטגוריה
      sheet.getRange(existingRow, 16, 1, 5).setValues([
        [
          rowValues[15],
          rowValues[16],
          rowValues[17],
          rowValues[18],
          rowValues[19],
        ],
      ]);
      if (rowValues[0]) sheet.getRange(existingRow, 1).setValue(rowValues[0]);
      if (rowValues[1]) sheet.getRange(existingRow, 2).setValue(rowValues[1]);
      if (rowValues[2]) sheet.getRange(existingRow, 3).setValue(rowValues[2]);
      if (rowValues[3]) sheet.getRange(existingRow, 4).setValue(rowValues[3]);
      if (rowValues[4]) sheet.getRange(existingRow, 5).setValue(rowValues[4]);
      if (rowValues[5]) sheet.getRange(existingRow, 6).setValue(rowValues[5]);
      if (rowValues[10]) sheet.getRange(existingRow, 11).setValue(rowValues[10]);
      if (rowValues[14]) sheet.getRange(existingRow, 15).setValue(rowValues[14]);
      updated++;
    } else {
      sheet.appendRow(rowValues);
      added++;
    }
  }

  autoFillCertDetails(sheet);
  return { added: added, updated: updated };
}

function doPost(e) {
  try {
    let data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    const pin = data.pin || data.authPin;
    const action = String(data.action || "").trim();

    if (String(pin).trim() !== CONFIG.SECURITY_PIN) {
      return ContentService.createTextOutput(
        JSON.stringify({ success: false, message: "קוד אבטחה שגוי" }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
      CONFIG.SHEET_NAME,
    );
    if (!sheet) {
      return ContentService.createTextOutput(
        JSON.stringify({
          success: false,
          message: 'שגיאה: הטאב "' + CONFIG.SHEET_NAME + '" לא נמצא בגיליון!',
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // רק action===sync — לא לפי קיום participantsToAdd
    const toAdd = Array.isArray(data.participantsToAdd)
      ? data.participantsToAdd
      : [];
    if (action === "sync") {
      const result = syncParticipantsToSheet_(sheet, toAdd);
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

    autoFillCertDetails(sheet);

    const templateType = String(data.templateType || "REGULAR").toUpperCase();
    const rawParticipantIds = data.participantIds || [];
    const participantIds = Array.isArray(rawParticipantIds)
      ? rawParticipantIds.map(function (id) {
          return String(id).trim();
        })
      : rawParticipantIds
        ? [String(rawParticipantIds).trim()]
        : [];

    let templateDocId = CONFIG.TEMPLATES.REGULAR;
    if (templateType === "REFRESH") templateDocId = CONFIG.TEMPLATES.REFRESH;
    else if (templateType === "SKIPPERS")
      templateDocId = CONFIG.TEMPLATES.SKIPPERS;
    else if (templateType === "BLS") templateDocId = CONFIG.TEMPLATES.BLS;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return ContentService.createTextOutput(
        JSON.stringify({
          success: false,
          message: "אין שורות בגיליון להפקה",
          processedCount: 0,
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const range = sheet.getRange(2, 1, lastRow - 1, 15);
    const values = range.getValues();
    const folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
    let processedCount = 0;

    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const rowIndex = i + 2;

      if (String(row[14] || "").trim() === "לא נכח") continue;

      const crmParticipantId = row[12] ? String(row[12]).trim() : "";
      if (participantIds.length > 0 && participantIds[0] !== "") {
        const isMatch = participantIds.some(function (id) {
          return (
            id === crmParticipantId ||
            (crmParticipantId && crmParticipantId.indexOf(id) !== -1)
          );
        });
        if (!isMatch) continue;
      }

      const fullName = row[0];
      const idNumber = row[1];
      const courseDateRaw = row[2];
      const email = row[3];
      const hours = row[5];
      const certNum = row[6];
      const validUntilVal = row[7];
      if (!fullName || !email) continue;

      const courseDate = parseToDate(courseDateRaw);
      const formattedCourseDate = courseDate
        ? Utilities.formatDate(courseDate, "GMT+3", "dd/MM/yyyy")
        : String(courseDateRaw);

      let formattedValidDate = "";
      const validDateObj = parseToDate(validUntilVal);
      if (validDateObj) {
        formattedValidDate = Utilities.formatDate(
          validDateObj,
          "GMT+3",
          "dd/MM/yyyy",
        );
      } else if (courseDate) {
        const validUntil = new Date(courseDate);
        validUntil.setFullYear(validUntil.getFullYear() + 2);
        formattedValidDate = Utilities.formatDate(
          validUntil,
          "GMT+3",
          "dd/MM/yyyy",
        );
        sheet.getRange(rowIndex, 8).setValue(validUntil);
      }

      const pdfFile = createCertificatePDF(
        templateDocId,
        folder,
        fullName,
        idNumber,
        hours,
        formattedCourseDate,
        formattedValidDate,
        certNum,
      );
      sheet.getRange(rowIndex, 14).setValue(pdfFile.getUrl());
      sendCertificateEmail(email, fullName, hours, pdfFile);
      sheet.getRange(rowIndex, 10).setValue(true);
      processedCount++;
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        message: "הונפקו ונשלחו " + processedCount + " תעודות בהצלחה!",
        processedCount: processedCount,
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
