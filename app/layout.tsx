import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { AuthProvider } from '@/lib/auth-context'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'MinBun ERP - Agriculture Investment Management',
  description: 'ERP system for agriculture company investor management and analytics',
  icons: {
    icon: [
      {
        url: '/potatoes.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/potatoes.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/potatoes.png',
        type: 'image/svg+xml',
      },
    ],
    apple: '/potatoes.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className="font-sans antialiased" suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
