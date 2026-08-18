/** חשבונות בנק לשליחת פרטים בוואטסאפ */
export type BankAccountKey = "linoy" | "yitzhak"

export const BANK_ACCOUNTS: Record<
  BankAccountKey,
  { label: string; message: string }
> = {
  linoy: {
    label: "חשבון לינוי",
    message: `פרטי חשבון לינוי:

שם בעל החשבון: לינוי שרם
בנק: 10 (לאומי)
סניף: 998
מספר חשבון: 27361135

📌 יש לשלוח אסמכתא לאחר העברה.`,
  },
  yitzhak: {
    label: "חשבון יצחק",
    message: `פרטי חשבון יצחק:

שם בעל החשבון: יצחק עזרא
בנק: 10 (לאומי)
סניף: 998
מספר חשבון: 28648789

📌 יש לשלוח אסמכתא לאחר העברה.`,
  },
}

export function bankAccountWhatsAppMessage(key: BankAccountKey): string {
  return BANK_ACCOUNTS[key].message
}
