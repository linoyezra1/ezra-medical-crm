import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Assistant } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { AppProvider } from '@/lib/store'
import './globals.css'

const assistant = Assistant({
  subsets: ['hebrew', 'latin'],
  variable: '--font-assistant',
})

export const metadata: Metadata = {
  title: 'ניהול מכירות | CRM הדרכות וציוד',
  description: 'מערכת ניהול לידים, הדרכות, ציוד ולקוחות - מותאמת לשימוש מהשטח',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="he" dir="rtl" className="bg-background">
      <body className={`${assistant.variable} font-sans antialiased`}>
        <AppProvider>{children}</AppProvider>
        <Toaster position="top-center" richColors />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
