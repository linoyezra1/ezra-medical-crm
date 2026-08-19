/**
 * תיקונים לסקריפט הפקת התעודות (להדביק במקום הפונקציות הקיימות).
 *
 * 1) הסקריפט לא מוסיף שורות — זה ה-CRM.
 * 2) עמודה O = נוכחות. לדלג רק על «לא נכח». תא ריק = נוכח (שורות ישנות).
 * 3) לקרוא 15 עמודות (A–O). PDF נשאר בעמודה N (14).
 * אחרי ההדבקה: Deploy → Manage deployments → עריכה → Version: New.
 */

function doGet() {
  return ContentService.createTextOutput("ok");
}

function isNotAttendedRow_(sheet, rowIndex, rowValues) {
  var fromRow = rowValues && rowValues.length > 14 ? rowValues[14] : "";
  var raw =
    fromRow !== "" && fromRow != null
      ? fromRow
      : sheet.getRange(rowIndex, 15).getValue();
  return String(raw || "").trim() === "לא נכח";
}

function autoFillCertDetails(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const range = sheet.getRange(2, 1, lastRow - 1, 8);
  const values = range.getValues();
  let currentCertNumber = getNextCertNumber(sheet);
  let updatedCount = 0;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const rowIndex = i + 2;
    if (isNotAttendedRow_(sheet, rowIndex, null)) continue;

    const fullName = row[0];
    const courseDateRaw = row[2];
    let certNum = row[6];
    let validUntilVal = row[7];

    if (fullName || courseDateRaw) {
      let rowNeedsUpdate = false;

      if (!certNum || String(certNum).trim() === "") {
        certNum = currentCertNumber;
        sheet.getRange(rowIndex, 7).setValue(certNum);
        currentCertNumber++;
        rowNeedsUpdate = true;
      }

      if (!validUntilVal || String(validUntilVal).trim() === "") {
        if (courseDateRaw) {
          const courseDate = new Date(courseDateRaw);
          if (!isNaN(courseDate.getTime())) {
            const validUntil = new Date(courseDate);
            validUntil.setFullYear(validUntil.getFullYear() + 2);
            const formattedValidDate = Utilities.formatDate(
              validUntil,
              "GMT+3",
              "dd/MM/yyyy",
            );
            sheet.getRange(rowIndex, 8).setValue(formattedValidDate);
            rowNeedsUpdate = true;
          }
        }
      }

      if (rowNeedsUpdate) updatedCount++;
    }
  }

  return updatedCount;
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
    const templateType = String(data.templateType || "REGULAR").toUpperCase();
    const rawParticipantIds = data.participantIds || [];

    const participantIds = Array.isArray(rawParticipantIds)
      ? rawParticipantIds.map((id) => String(id).trim())
      : [String(rawParticipantIds).trim()];

    if (String(pin).trim() !== CONFIG.SECURITY_PIN) {
      return ContentService.createTextOutput(
        JSON.stringify({
          success: false,
          message: "קוד אבטחה שגוי",
        }),
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

    autoFillCertDetails(sheet);

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

      if (isNotAttendedRow_(sheet, rowIndex, row)) continue;

      const crmParticipantId = row[12] ? String(row[12]).trim() : "";

      if (participantIds.length > 0 && participantIds[0] !== "") {
        const isMatch = participantIds.some(
          (id) =>
            id === crmParticipantId ||
            (crmParticipantId && crmParticipantId.includes(id)),
        );
        if (!isMatch) continue;
      }

      const fullName = row[0];
      const idNumber = row[1];
      const courseDateRaw = row[2];
      const email = row[3];
      const hours = row[5];
      const certNum = row[6];
      let validUntilVal = row[7];

      if (!fullName || !email) continue;

      const courseDate = new Date(courseDateRaw);
      const formattedCourseDate = !isNaN(courseDate.getTime())
        ? Utilities.formatDate(courseDate, "GMT+3", "dd/MM/yyyy")
        : String(courseDateRaw);

      let formattedValidDate = "";
      if (validUntilVal instanceof Date && !isNaN(validUntilVal.getTime())) {
        formattedValidDate = Utilities.formatDate(
          validUntilVal,
          "GMT+3",
          "dd/MM/yyyy",
        );
      } else if (validUntilVal) {
        formattedValidDate = String(validUntilVal);
      } else if (!isNaN(courseDate.getTime())) {
        const validUntil = new Date(courseDate);
        validUntil.setFullYear(validUntil.getFullYear() + 2);
        formattedValidDate = Utilities.formatDate(
          validUntil,
          "GMT+3",
          "dd/MM/yyyy",
        );
        sheet.getRange(rowIndex, 8).setValue(formattedValidDate);
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

      const pdfUrl = pdfFile.getUrl();
      sheet.getRange(rowIndex, 14).setValue(pdfUrl);

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
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
