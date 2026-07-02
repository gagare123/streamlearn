import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import { AuthProviderWrapper } from '@/components/auth/auth-provider-wrapper'
import './globals.css'

export const metadata: Metadata = {
  title: { template: '%s | StreamLearn', default: 'StreamLearn — Learn Without Limits' },
  description: 'Production-grade e-learning platform.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#4f46e5',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-white font-sans antialiased">
        <AuthProviderWrapper>
          {children}
          <Toaster position="bottom-right" richColors closeButton duration={4000} />
        </AuthProviderWrapper>
      </body>
    </html>
  )
}
