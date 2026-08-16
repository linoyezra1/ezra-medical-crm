/**
 * תבנית מייל ברוכים הבאים ל־LMS — HTML בטוח לקידוד (ללא אמוג׳ים).
 * משמש את ה-CRM ולשליחה ל-Google Apps Script.
 */

export const LMS_EMAIL_BRAND_NAME = "עזרה ורפואה"
export const LMS_EMAIL_BRAND_BLUE = "#0284c7"
export const LMS_EMAIL_FOOTER_TEXT = "#334155"
export const LMS_EMAIL_MAX_WIDTH_PX = 580

/** סעיף «מה מחכה לך במערכת?» — המלל המאושר (לא גרסת «חומרי לימוד מוקלטים…») */
export const LMS_EMAIL_WHAT_AWAITS_TITLE = "מה מחכה לך במערכת?"
export const LMS_EMAIL_WHAT_AWAITS_ITEMS = [
  "שקפי לימוד מובנים ומחולקים לפי נושאים.",
  "שאלת בדיקה עצמית בסוף כל שקף לחיזוק החומר.",
  "מעקב רציף אחר אחוזי הלמידה וההתקדמות האישית שלך.",
  "צ'אט ישיר להתייעצות ומענה ממדריך עזרה ראשונה לאורך כל הדרך.",
] as const

export type LmsWelcomeEmailParams = {
  fullName: string
  /** שם משתמש וסיסמה = תעודת זהות */
  idNumber: string
  loginUrl: string
  businessName?: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function lmsWelcomeEmailSubject(businessName = LMS_EMAIL_BRAND_NAME): string {
  return `פרטי התחברות למערכת הלמידה — ${businessName}`
}

/**
 * מייל HTML ממותג: באנר כחול, רוחב מקסימלי 580px, ללא אמוג׳ים ב־HTML.
 */
export function buildLmsWelcomeEmailHtml(params: LmsWelcomeEmailParams): string {
  const brand = (params.businessName || LMS_EMAIL_BRAND_NAME).trim() || LMS_EMAIL_BRAND_NAME
  const name = escapeHtml(params.fullName.trim() || "מודרך/ת")
  const idNumber = escapeHtml(params.idNumber.trim())
  const loginUrl = escapeHtml(params.loginUrl.trim() || "#")
  const brandEsc = escapeHtml(brand)
  const w = LMS_EMAIL_MAX_WIDTH_PX
  const blue = LMS_EMAIL_BRAND_BLUE
  const footer = LMS_EMAIL_FOOTER_TEXT

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(lmsWelcomeEmailSubject(brand))}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="${w}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${w}px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td align="center" style="background-color:${blue};padding:28px 24px;">
              <p style="margin:0;font-size:13px;letter-spacing:0.04em;color:#e0f2fe;font-weight:600;">מערכת הלמידה</p>
              <h1 style="margin:8px 0 0;font-size:26px;line-height:1.3;color:#ffffff;font-weight:700;">${brandEsc}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;color:#0f172a;font-size:16px;line-height:1.7;text-align:right;">
              <p style="margin:0 0 12px;">שלום ${name},</p>
              <p style="margin:0 0 16px;">נוצר עבורך חשבון במערכת הלמידה של <strong>${brandEsc}</strong>. להלן פרטי ההתחברות:</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                <tr>
                  <td style="padding:16px 18px;text-align:right;color:#0f172a;font-size:15px;line-height:1.8;">
                    <p style="margin:0 0 8px;"><span style="color:#64748b;font-size:13px;">שם משתמש</span><br /><strong style="font-size:17px;letter-spacing:0.02em;" dir="ltr">${idNumber}</strong></p>
                    <p style="margin:0;"><span style="color:#64748b;font-size:13px;">סיסמה</span><br /><strong style="font-size:17px;letter-spacing:0.02em;" dir="ltr">${idNumber}</strong></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 24px 8px;">
              <a href="${loginUrl}" style="display:inline-block;background-color:${blue};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;">כניסה למערכת הלמידה</a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 4px;text-align:center;font-size:12px;line-height:1.6;color:${footer};">
              <p style="margin:0;" dir="ltr">${loginUrl}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 8px;text-align:right;color:#0f172a;">
              <h2 style="margin:0 0 12px;font-size:18px;line-height:1.4;color:${blue};font-weight:700;">${escapeHtml(LMS_EMAIL_WHAT_AWAITS_TITLE)}</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:15px;line-height:1.75;color:#0f172a;">
                ${LMS_EMAIL_WHAT_AWAITS_ITEMS.map(
                  (item, i) =>
                    `<tr><td style="padding:0 0 ${i === LMS_EMAIL_WHAT_AWAITS_ITEMS.length - 1 ? "0" : "10px"};text-align:right;">${escapeHtml(item)}</td></tr>`,
                ).join("")}
              </table>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid #e2e8f0;padding:18px 24px 22px;text-align:center;font-size:12px;line-height:1.7;color:${footer};">
              <p style="margin:0;font-weight:700;color:${footer};">${brandEsc}</p>
              <p style="margin:6px 0 0;color:${footer};">הודעה זו נשלחה אוטומטית. אין להשיב למייל זה.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
