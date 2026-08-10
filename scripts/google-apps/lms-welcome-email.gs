/**
 * Google Apps Script — LMS-CRM welcome email helpers
 * Paste into the LMS Web App project (tab: LMS-CRM / משתמשים מערכת למידה - CRM).
 *
 * Prefer using `emailHtml` / `emailSubject` from the CRM payload when present.
 * Brand must be "עזרה ורפואה" (never "בריאות ורפואה").
 * Do NOT put raw emoji characters inside HTML string literals (encoding breakage).
 */

var LMS_BRAND_NAME = "עזרה ורפואה";
var LMS_BRAND_BLUE = "#0284c7";
var LMS_FOOTER_TEXT = "#334155";
var LMS_EMAIL_MAX_WIDTH = 580;

function escapeHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function lmsWelcomeEmailSubject_(brandName) {
  var brand = brandName || LMS_BRAND_NAME;
  return "פרטי התחברות למערכת הלמידה — " + brand;
}

/**
 * Fallback HTML builder if CRM did not send emailHtml.
 * Centered 580px card, brand-blue header, high-contrast footer — no emojis.
 */
function buildLmsWelcomeEmailHtml_(p) {
  var brand = escapeHtml_(p.businessName || LMS_BRAND_NAME);
  var name = escapeHtml_(p.fullName || "מודרך/ת");
  var idNumber = escapeHtml_(p.idNumber || "");
  var loginUrl = escapeHtml_(p.loginUrl || "#");
  var w = LMS_EMAIL_MAX_WIDTH;
  var blue = LMS_BRAND_BLUE;
  var footer = LMS_FOOTER_TEXT;

  return (
    '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8" />' +
    "<title>" +
    escapeHtml_(lmsWelcomeEmailSubject_(p.businessName || LMS_BRAND_NAME)) +
    "</title></head>" +
    '<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:24px 12px;"><tr><td align="center">' +
    '<table role="presentation" width="' +
    w +
    '" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:' +
    w +
    'px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">' +
    '<tr><td align="center" style="background-color:' +
    blue +
    ';padding:28px 24px;">' +
    '<p style="margin:0;font-size:13px;letter-spacing:0.04em;color:#e0f2fe;font-weight:600;">מערכת הלמידה</p>' +
    '<h1 style="margin:8px 0 0;font-size:26px;line-height:1.3;color:#ffffff;font-weight:700;">' +
    brand +
    "</h1></td></tr>" +
    '<tr><td style="padding:28px 24px 8px;color:#0f172a;font-size:16px;line-height:1.7;text-align:right;">' +
    '<p style="margin:0 0 12px;">שלום ' +
    name +
    ",</p>" +
    '<p style="margin:0 0 16px;">נוצר עבורך חשבון במערכת הלמידה של <strong>' +
    brand +
    "</strong>. להלן פרטי ההתחברות:</p></td></tr>" +
    '<tr><td style="padding:0 24px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;"><tr><td style="padding:16px 18px;text-align:right;color:#0f172a;font-size:15px;line-height:1.8;">' +
    '<p style="margin:0 0 8px;"><span style="color:#64748b;font-size:13px;">שם משתמש</span><br /><strong style="font-size:17px;" dir="ltr">' +
    idNumber +
    "</strong></p>" +
    '<p style="margin:0;"><span style="color:#64748b;font-size:13px;">סיסמה</span><br /><strong style="font-size:17px;" dir="ltr">' +
    idNumber +
    "</strong></p></td></tr></table></td></tr>" +
    '<tr><td align="center" style="padding:20px 24px 8px;">' +
    '<a href="' +
    loginUrl +
    '" style="display:inline-block;background-color:' +
    blue +
    ';color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;">כניסה למערכת הלמידה</a></td></tr>' +
    '<tr><td style="padding:8px 24px 24px;text-align:center;font-size:12px;line-height:1.6;color:' +
    footer +
    ';"><p style="margin:0;" dir="ltr">' +
    loginUrl +
    "</p></td></tr>" +
    '<tr><td style="border-top:1px solid #e2e8f0;padding:18px 24px 22px;text-align:center;font-size:12px;line-height:1.7;color:' +
    footer +
    ';"><p style="margin:0;font-weight:700;color:' +
    footer +
    ';">' +
    brand +
    '</p><p style="margin:6px 0 0;color:' +
    footer +
    ';">הודעה זו נשלחה אוטומטית. אין להשיב למייל זה.</p></td></tr>' +
    "</table></td></tr></table></body></html>"
  );
}

/**
 * Example send helper — use CRM emailHtml when available.
 * Replace any old brand string "בריאות ורפואה" with LMS_BRAND_NAME.
 */
function sendLmsWelcomeEmail_(participant) {
  var to = participant.email;
  if (!to) return;
  var subject =
    participant.emailSubject ||
    lmsWelcomeEmailSubject_(participant.businessName || LMS_BRAND_NAME);
  var html =
    participant.emailHtml ||
    buildLmsWelcomeEmailHtml_({
      fullName: participant.fullName,
      idNumber: participant.idNumber,
      loginUrl: participant.loginUrl,
      businessName: LMS_BRAND_NAME,
    });

  GmailApp.sendEmail(to, subject, "פרטי התחברות למערכת הלמידה — עזרה ורפואה", {
    htmlBody: html,
    name: LMS_BRAND_NAME,
  });
}
