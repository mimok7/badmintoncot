import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '배드민턴 코트 예약 시스템',
  description: 'QR 입장 및 실시간 코트 배정',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
