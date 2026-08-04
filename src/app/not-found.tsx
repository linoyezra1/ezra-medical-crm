import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "לא נמצא | עזרה ורפואה CRM",
};

export default function NotFound() {
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-xl font-bold">העמוד לא נמצא</h1>
      <p className="text-sm text-muted-foreground">ייתכן שהקישור שגוי או שהרשומה נמחקה.</p>
      <a href="/leads" className="text-sm font-semibold text-primary underline">
        חזרה ללידים
      </a>
    </div>
  );
}
