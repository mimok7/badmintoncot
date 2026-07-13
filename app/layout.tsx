import type { Metadata } from 'next'
import './globals.css'
import AppMessageProvider from '@/components/app-message-provider'

export const metadata: Metadata = {
  title: '민턴 코트',
  description: '위치 기반 구장 입장 및 실시간 코트 배정',
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        <meta name="theme-color" content="#4f46e5" />
        <link rel="apple-touch-icon" href="/badcotlogo.png" />
      </head>
      <body>
        <AppMessageProvider>{children}</AppMessageProvider>
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').then(function() {
              }).catch(function(err) {
                console.error('PWA ServiceWorker registration failed: ', err);
              });
            });
          }
        `}} />
      </body>
    </html>
  )
}
