import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "עזרא ורפואה | CRM",
  description: "מערכת CRM לניהול קורסי עזרה ראשונה ומכירת ציוד",
  appleWebApp: {
    capable: true,
    title: "עזרא CRM",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f6b4c",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">
        <AppNav />
        <main className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-4 pb-24 pt-3">{children}</main>
      </body>
    </html>
  );
}
