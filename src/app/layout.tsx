import type { Metadata, Viewport } from "next";
import { Assistant } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AppProviders } from "@/components/AppProviders";
import "./globals.css";

const assistant = Assistant({
  subsets: ["hebrew", "latin"],
  variable: "--font-assistant",
});

export const metadata: Metadata = {
  title: "עזרא ורפואה | CRM",
  description: "מערכת ניהול לידים, הדרכות, ציוד ולקוחות - מותאמת לשימוש מהשטח",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className="light bg-background">
      <body className={`${assistant.variable} font-sans antialiased`}>
        <AppProviders>{children}</AppProviders>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
